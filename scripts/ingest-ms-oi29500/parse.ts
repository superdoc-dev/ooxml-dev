/**
 * MS-OI29500 markdown parser.
 *
 * Input: a single Microsoft Learn page fetched via `?accept=text/markdown`,
 * plus optionally the toc_title (which carries the entry_id like "2.1.1779"
 * that's not present in the H1).
 * Output: a structured representation of the page's title, frontmatter, and
 * lettered claim groups with their italic "spec says" text and indented
 * "Word does" behavior bullets.
 *
 * The native Microsoft Learn markdown shape is regular:
 *
 *   ---
 *   <YAML frontmatter with git_commit_id, updated_at, source_path, etc.>
 *   ---
 *
 *   # [MS-OI29500]: Part 4 Section 14.9.1.1, txbxContent (Rich Text Box ...) | Microsoft Learn
 *
 *   - *For additional notes...* [oMath, §22.1.2.77(f)](...) ...   <-- preamble (skip)
 *
 *   a. *The standard states that text box content can be placed inside endnotes...*
 *
 *       - Word does not allow textbox content inside endnotes...
 *
 *   b. *The standard specifies this element as part of the WordprocessingML namespace.*
 *
 *       - Word will save an mce choice for VML content...
 *       - This note applies to the following products: Office 2013 Client (Strict)...
 *
 * Version-scope bullets (`This note applies to the following products: ...`)
 * are attached to the previous behavior in the same claim group, not emitted
 * as their own behavior row.
 */

export interface MsImplementationPage {
	/** MS-internal entry id (e.g. "2.1.1779"), supplied by the caller from the
	 *  toc_title since it's not present in the H1. */
	entryId: string | null;
	/** Native frontmatter parsed as a key-value map (string-only values). */
	frontmatter: Record<string, string>;
	/** The H1 of the page, with " | Microsoft Learn" stripped. */
	rawTitle: string | null;
	/** Title parsed into structured parts when the canonical shape matches. */
	parsedTitle: ParsedTitle | null;
	/** Whether this page is a candidate for behavior_notes ingest. Requires
	 *  parsable Part/Section + at least one claim group + at least one behavior
	 *  row across all claims (a claim group without behaviors yields no
	 *  behavior_notes rows and is treated as skip). */
	ingestable: boolean;
	/** Reason for skipping when not ingestable. */
	skipReason: string | null;
	/** Lettered claim groups extracted from the body. */
	claims: ParsedClaim[];
}

export interface ParsedTitle {
	entryId: string | null;
	partNumber: number | null;
	ecmaSection: string | null;
	name: string | null;
	description: string | null;
}

export interface ParsedClaim {
	/** "a", "b", ... All observed pages use lettered headers; null is reserved
	 *  for a future single-anonymous-claim path that we have not yet seen in
	 *  the corpus. */
	label: string | null;
	/** Standard text from the italic block, normalized (single-line). */
	standardText: string;
	/** One row per `    -` bullet. Excludes version-scope marker bullets, which
	 *  attach to the immediately preceding behavior. */
	behaviors: ParsedBehavior[];
}

export interface ParsedBehavior {
	/** Verbatim behavior text, normalized to single-line. */
	text: string;
	/** Set when a "This note applies to the following products: ..." marker
	 *  follows this behavior. */
	versionScope: string | null;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const H1_RE = /^#\s+(.+?)\s*$/m;
const TITLE_PARSE_RE =
	/^(?:\[MS-OI29500\]:\s*)?(?:Part\s+(\d+)\s+Section\s+([\d.]+),\s+)?(.+?)(?:\s*\|\s*Microsoft Learn)?$/;
const ENTRY_ID_RE = /^(\d+\.\d+(?:\.\d+)*)\s+(.*)$/;
const NAME_DESC_RE = /^(.+?)\s*\(([^)]+)\)\s*$/;

function normalizeLineEndings(s: string): string {
	// Microsoft Learn serves CRLF in markdown bodies. Normalize to LF so the
	// rest of the parser can rely on `\n` line splits and `.` regex matching
	// (JS regex `.` does not match `\r`).
	return s.replace(/\r\n?/g, "\n");
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
	const normalized = normalizeLineEndings(content);
	const m = normalized.match(FRONTMATTER_RE);
	if (!m) return { frontmatter: {}, body: normalized };
	const fmText = m[1];
	const body = normalized.slice(m[0].length);

	const fm: Record<string, string> = {};
	for (const line of fmText.split("\n")) {
		const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*?)\s*$/);
		if (!kv) continue;
		const key = kv[1];
		let value = kv[2];
		if (
			(value.startsWith("'") && value.endsWith("'")) ||
			(value.startsWith('"') && value.endsWith('"'))
		) {
			value = value.slice(1, -1);
		}
		fm[key] = value;
	}
	return { frontmatter: fm, body };
}

function parseTitle(rawTitle: string): ParsedTitle | null {
	const m = rawTitle.match(TITLE_PARSE_RE);
	if (!m) return null;

	const partNumber = m[1] ? parseInt(m[1], 10) : null;
	const ecmaSection = m[2] || null;
	let nameAndDesc = m[3].trim();

	let entryId: string | null = null;
	const entryM = nameAndDesc.match(ENTRY_ID_RE);
	if (entryM) {
		entryId = entryM[1];
		nameAndDesc = entryM[2];
	}

	let name: string | null = nameAndDesc;
	let description: string | null = null;
	const descM = nameAndDesc.match(NAME_DESC_RE);
	if (descM) {
		name = descM[1].trim();
		description = descM[2].trim();
	}

	return { entryId, partNumber, ecmaSection, name, description };
}

function normalize(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

const VERSION_SCOPE_PREFIX = "this note applies to the following products:";

function isVersionScopeMarker(text: string): boolean {
	return text.toLowerCase().startsWith(VERSION_SCOPE_PREFIX);
}

function extractVersionScope(text: string): string {
	return text.slice(VERSION_SCOPE_PREFIX.length).trim();
}

/**
 * Find lettered claim headers in the body. The shape is `^[a-z]\. \*...\*` —
 * the italic spec text may span lines (markdown rewraps), so we accept any
 * content up to the next blank line.
 */
function findLetteredHeaders(body: string): Array<{
	label: string;
	standardText: string;
	startIndex: number;
	endIndex: number;
}> {
	const lines = body.split("\n");
	const headers: Array<{
		label: string;
		standardText: string;
		startIndex: number;
		endIndex: number;
	}> = [];

	// Compute byte offsets per line for slicing later
	const offsets: number[] = [];
	let off = 0;
	for (const line of lines) {
		offsets.push(off);
		off += line.length + 1;
	}

	const headerStart = /^([a-z])\.\s+\*/;

	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(headerStart);
		if (!m) continue;
		const label = m[1];
		// Collect the italic block: starts on this line at the `*`, may continue
		// across following lines until a `*` closes it. Microsoft's converter
		// generally keeps the italic on a single paragraph.
		const startIndex = offsets[i];

		// Slice from the `*` position through subsequent non-empty lines.
		const firstStarIdx = lines[i].indexOf("*");
		const collected: string[] = [lines[i].slice(firstStarIdx + 1)];
		let j = i;
		// Read forward until we find a closing star outside of inline emphasis.
		// In practice a single italic span runs to end-of-paragraph; we accumulate
		// lines until a blank line.
		if (!collected[0].endsWith("*")) {
			j = i + 1;
			while (j < lines.length && lines[j].trim().length > 0) {
				collected.push(lines[j]);
				if (lines[j].trimEnd().endsWith("*")) break;
				j++;
			}
		}
		const concat = collected.join(" ");
		const endStarIdx = concat.lastIndexOf("*");
		if (endStarIdx === -1) continue; // malformed
		const standardText = normalize(concat.slice(0, endStarIdx));

		// Find where this group's behavior block ends: next lettered header or EOF.
		let blockEndLine = lines.length;
		for (let k = j + 1; k < lines.length; k++) {
			if (lines[k].match(headerStart)) {
				blockEndLine = k;
				break;
			}
		}
		const endIndex = offsets[blockEndLine] ?? body.length;
		headers.push({ label, standardText, startIndex, endIndex });
	}

	return headers;
}

/**
 * Extract behavior bullets from a slice of body. Bullets are 4-space-indented
 * dash items: `^    - text`. Multi-line bullet content continues with another
 * 4+ space indent until a blank line or a non-indented line.
 */
function extractBehaviorBullets(slice: string): ParsedBehavior[] {
	const lines = slice.split("\n");
	const bullets: ParsedBehavior[] = [];
	let current: string[] | null = null;

	const flush = () => {
		if (!current) return;
		const joined = normalize(current.join(" "));
		if (joined.length === 0) {
			current = null;
			return;
		}
		if (isVersionScopeMarker(joined)) {
			// Attach scope to the previous behavior. If there is no previous
			// behavior (rare: scope-only claim), drop it — there's no row for it
			// to belong to. Real corpus has not exhibited this case.
			const scope = extractVersionScope(joined);
			if (bullets.length > 0) {
				bullets[bullets.length - 1].versionScope = scope;
			}
		} else {
			bullets.push({ text: joined, versionScope: null });
		}
		current = null;
	};

	for (const line of lines) {
		const startsBullet = /^ {4}- (.*)$/.exec(line);
		const continuesBullet = /^ {6}\S/.test(line) || /^ {8}\S/.test(line);
		if (startsBullet) {
			flush();
			current = [startsBullet[1]];
		} else if (current !== null && continuesBullet) {
			current.push(line.trim());
		} else if (line.trim() === "") {
			flush();
		} else if (current !== null) {
			flush();
		}
	}
	flush();
	return bullets;
}

/**
 * Extract the entry_id (e.g. "2.1.1779") from a toc_title shaped like
 * "2.1.1779 Part 4 Section 14.9.1.1, txbxContent (...)". Returns null when
 * the toc_title doesn't follow the expected pattern.
 */
export function entryIdFromTocTitle(tocTitle: string | null | undefined): string | null {
	if (!tocTitle) return null;
	const m = tocTitle.match(/^(\d+\.\d+(?:\.\d+)*)\s/);
	return m ? m[1] : null;
}

export function parsePage(
	content: string,
	opts?: { entryId?: string | null },
): MsImplementationPage {
	const { frontmatter, body } = parseFrontmatter(content);
	const entryId = opts?.entryId ?? null;

	const h1Match = body.match(H1_RE);
	const rawTitle = h1Match ? h1Match[1].replace(/\s*\|\s*Microsoft Learn\s*$/, "").trim() : null;
	const parsedTitle = rawTitle ? parseTitle(rawTitle) : null;
	if (parsedTitle && entryId) parsedTitle.entryId = entryId;

	let skipReason: string | null = null;
	let ingestable = true;
	if (!parsedTitle || parsedTitle.partNumber == null) {
		ingestable = false;
		skipReason = "title lacks Part/Section";
	}

	const headers = findLetteredHeaders(body);
	const claims: ParsedClaim[] = [];
	for (const h of headers) {
		const slice = body.slice(h.startIndex, h.endIndex);
		const behaviors = extractBehaviorBullets(slice);
		claims.push({ label: h.label, standardText: h.standardText, behaviors });
	}

	const totalBehaviors = claims.reduce((a, c) => a + c.behaviors.length, 0);

	if (ingestable) {
		if (claims.length === 0) {
			ingestable = false;
			skipReason = "no claim groups detected";
		} else if (totalBehaviors === 0) {
			// Pages with claim headers but no usable behavior text (e.g. behaviors
			// stored in markdown tables) produce no behavior_notes rows. Skip them
			// rather than counting as a successful parse.
			ingestable = false;
			skipReason = "claims found but no behavior bullets (likely table-based)";
		}
	}

	return {
		entryId,
		frontmatter,
		rawTitle,
		parsedTitle,
		ingestable,
		skipReason,
		claims,
	};
}
