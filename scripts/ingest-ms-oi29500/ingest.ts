/**
 * Ingest MS-OI29500 implementation notes into `behavior_notes`.
 *
 * Pipeline:
 *   1. Fetch toc.json + per-page native markdown (cached locally).
 *   2. Parse each page into structured claim groups.
 *   3. Resolve each entry's (name, ecmaSection, partNumber) to an
 *      `xsd_symbols` row when possible (transitional profile).
 *   4. Classify each behavior bullet's claim_type from its verb pattern.
 *   5. Replace all rows for source_id=ms-oi29500, then bulk-insert the new
 *      ones. Idempotent: same input → same row counts.
 *
 * Usage:
 *   DATABASE_URL=... bun scripts/ingest-ms-oi29500/ingest.ts             # full corpus
 *   DATABASE_URL=... bun scripts/ingest-ms-oi29500/ingest.ts --count 100 # first N pages (for testing)
 *   DATABASE_URL=... bun scripts/ingest-ms-oi29500/ingest.ts --refresh   # invalidate page cache
 *   DATABASE_URL=... bun scripts/ingest-ms-oi29500/ingest.ts --dry-run   # parse + resolve, skip DB writes
 */

import type { Sql } from "postgres";

import { createDbClient } from "../../packages/shared/src/db/index.ts";

import { inferApp, minConfidence } from "./app-inference.ts";
import { classifyClaim } from "./claim-type.ts";
import { fetchPage, fetchToc, filterImplementationNotes, type TocPage } from "./fetch.ts";
import { entryIdFromTocTitle, type ParsedClaim, parsePage } from "./parse.ts";
import { loadSymbolMap, resolveSymbol, type SymbolMap } from "./resolve.ts";

const SOURCE_NAME = "ms-oi29500";
// Editorial confidence in the truth of the claim. MS-OI29500 is published by
// Microsoft and authoritative for Office implementation behavior; we set 'high'
// across the board. Hand-curated rows may use 'medium' / 'low' separately.
const SOURCE_EDITORIAL_CONFIDENCE = "high" as const;
const BATCH_CHUNK = 500;

interface CliArgs {
	count: number | null;
	refresh: boolean;
	dryRun: boolean;
	verbose: boolean;
}

interface BehaviorNoteRow {
	symbol_id: number | null;
	app: string;
	version_scope: string | null;
	claim_type: string;
	summary: string;
	source_id: number;
	section_id: string | null;
	confidence: string | null;
	source_anchor: string;
	source_commit: string | null;
	claim_label: string | null;
	claim_index: number;
	target_ref: string | null;
	standard_text: string;
	behavior_text: string;
	resolution_confidence: string | null;
}

interface IngestStats {
	pagesTotal: number;
	pagesIngestable: number;
	pagesSkipped: number;
	rowsInserted: number;
	resolvedTopLevel: number;
	resolvedLocal: number;
	unresolvedNoVocab: number;
	unresolvedNoMatch: number;
	unresolvedAmbiguous: number;
}

function parseArgs(): CliArgs {
	const args: CliArgs = { count: null, refresh: false, dryRun: false, verbose: false };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--count") args.count = parseInt(argv[++i] ?? "", 10);
		else if (a === "--refresh") args.refresh = true;
		else if (a === "--dry-run") args.dryRun = true;
		else if (a === "--verbose") args.verbose = true;
		else if (a === "--help" || a === "-h") {
			console.log(
				"Usage: bun scripts/ingest-ms-oi29500/ingest.ts [--count N] [--refresh] [--dry-run] [--verbose]",
			);
			process.exit(0);
		} else throw new Error(`Unknown argument: ${a}`);
	}
	return args;
}

async function lookupSourceId(sql: Sql, name: string): Promise<number> {
	const rows = await sql<Array<{ id: number }>>`
		SELECT id FROM reference_sources WHERE name = ${name} LIMIT 1
	`;
	if (rows.length === 0) {
		throw new Error(
			`reference_sources row not found for '${name}'. Run 'bun run sources:sync' first.`,
		);
	}
	return rows[0].id;
}

function buildRow(args: {
	sourceId: number;
	sourceAnchor: string;
	sourceCommit: string | null;
	sectionId: string | null;
	app: string;
	claim: ParsedClaim;
	claimIndex: number;
	behaviorIndex: number;
	behaviorText: string;
	versionScope: string | null;
	resolutionSymbolId: number | null;
	resolutionConfidence: "high" | "medium" | "low" | null;
	targetRef: string | null;
}): BehaviorNoteRow {
	const { claimType, confidence: classifierConfidence } = classifyClaim(args.behaviorText);
	const summary =
		args.behaviorText.length > 280 ? `${args.behaviorText.slice(0, 277)}...` : args.behaviorText;

	// claim_index uniquely identifies this row within the page (claim_label
	// alone collides for multi-bullet groups). claim_label stays as the
	// human-readable letter ('a', 'b', ...) for display.
	const compositeIndex = args.claimIndex * 100 + args.behaviorIndex;

	// resolution_confidence is the worst-of (claim-type classifier, symbol
	// resolver). If either is shaky, the row is shaky.
	const resolutionConfidence = minConfidence(classifierConfidence, args.resolutionConfidence);

	return {
		symbol_id: args.resolutionSymbolId,
		app: args.app,
		version_scope: args.versionScope,
		claim_type: claimType,
		summary,
		source_id: args.sourceId,
		section_id: args.sectionId,
		// Editorial confidence: MS-OI29500 is authoritative.
		confidence: SOURCE_EDITORIAL_CONFIDENCE,
		source_anchor: args.sourceAnchor,
		source_commit: args.sourceCommit,
		claim_label: args.claim.label ?? null,
		claim_index: compositeIndex,
		target_ref: args.targetRef,
		standard_text: args.claim.standardText,
		behavior_text: args.behaviorText,
		resolution_confidence: resolutionConfidence,
	};
}

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
	for (let i = 0; i < items.length; i += size) {
		await fn(items.slice(i, i + size));
	}
}

async function ingestRows(sql: Sql, sourceId: number, rows: BehaviorNoteRow[], verbose: boolean) {
	await sql.begin(async (tx) => {
		const deleted = await tx`DELETE FROM behavior_notes WHERE source_id = ${sourceId}`;
		if (verbose) console.log(`  cleared ${deleted.count} existing rows for source_id=${sourceId}`);

		await inChunks(rows, BATCH_CHUNK, async (chunk) => {
			await tx`
				INSERT INTO behavior_notes ${tx(
					chunk,
					"symbol_id",
					"app",
					"version_scope",
					"claim_type",
					"summary",
					"source_id",
					"section_id",
					"confidence",
					"source_anchor",
					"source_commit",
					"claim_label",
					"claim_index",
					"target_ref",
					"standard_text",
					"behavior_text",
					"resolution_confidence",
				)}
			`;
			if (verbose) console.log(`  inserted ${chunk.length} rows`);
		});
	});
}

async function main() {
	const args = parseArgs();

	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("Set DATABASE_URL");

	const db = createDbClient(url);

	console.log(`Loading source row '${SOURCE_NAME}' and symbol map...`);
	const sourceId = await lookupSourceId(db.sql, SOURCE_NAME);
	const map: SymbolMap = await loadSymbolMap(db.sql);
	console.log(`  source_id=${sourceId}; ${map.all.length} symbols loaded.\n`);

	console.log("Fetching toc.json...");
	const allEntries = await fetchToc(args.refresh);
	const candidates = filterImplementationNotes(allEntries);
	console.log(`  ${candidates.length} implementation-note pages in toc.\n`);

	const subset: TocPage[] = args.count !== null ? candidates.slice(0, args.count) : candidates;
	console.log(`Fetching ${subset.length} page(s) (cached unless --refresh)...`);

	const rows: BehaviorNoteRow[] = [];
	const stats: IngestStats = {
		pagesTotal: subset.length,
		pagesIngestable: 0,
		pagesSkipped: 0,
		rowsInserted: 0,
		resolvedTopLevel: 0,
		resolvedLocal: 0,
		unresolvedNoVocab: 0,
		unresolvedNoMatch: 0,
		unresolvedAmbiguous: 0,
	};

	for (let i = 0; i < subset.length; i++) {
		const page = subset[i];
		const fetched = await fetchPage(page, { refresh: args.refresh });
		const entryId = entryIdFromTocTitle(page.tocTitle);
		const parsed = parsePage(fetched.content, { entryId });

		if (i % 50 === 0 && i > 0) {
			console.log(`  progress: ${i}/${subset.length} pages, ${rows.length} rows so far`);
		}

		if (!parsed.ingestable) {
			stats.pagesSkipped++;
			continue;
		}
		stats.pagesIngestable++;

		const t = parsed.parsedTitle;
		const ecmaSection = t?.ecmaSection ?? null;
		const partNumber = t?.partNumber ?? null;
		const name = t?.name ?? null;
		const sourceCommit = parsed.frontmatter.git_commit_id ?? null;

		// Resolve once per page (the symbol context is the same across claims).
		let resolutionSymbolId: number | null = null;
		let resolutionConfidence: "high" | "medium" | "low" | null = null;
		let targetRef: string | null = null;

		if (ecmaSection && name) {
			const outcome = resolveSymbol(map, name, ecmaSection, partNumber);
			if (outcome.resolved) {
				resolutionSymbolId = outcome.symbolId;
				resolutionConfidence = outcome.confidence;
				if (outcome.isLocal) stats.resolvedLocal++;
				else stats.resolvedTopLevel++;
			} else {
				targetRef = outcome.targetRef;
				if (outcome.reason === "no-vocabulary") stats.unresolvedNoVocab++;
				else if (outcome.reason === "no-match") stats.unresolvedNoMatch++;
				else if (outcome.reason === "ambiguous") stats.unresolvedAmbiguous++;
			}
		} else {
			targetRef = `Section ${ecmaSection ?? "?"}, ${name ?? "?"}`;
			stats.unresolvedNoVocab++;
		}

		// Section_id stores both the ECMA section ('17.4.37') and the entry_id
		// ('2.1.149') as a compact citation. Tools format these for display.
		const sectionId = entryId
			? `${entryId} (Part ${partNumber ?? "?"} §${ecmaSection ?? "?"})`
			: ecmaSection;

		parsed.claims.forEach((claim, claimIdx) => {
			claim.behaviors.forEach((behavior, behaviorIdx) => {
				rows.push(
					buildRow({
						sourceId,
						sourceAnchor: page.href,
						sourceCommit,
						sectionId,
						app: inferApp(partNumber, ecmaSection, behavior.text),
						claim,
						claimIndex: claimIdx,
						behaviorIndex: behaviorIdx,
						behaviorText: behavior.text,
						versionScope: behavior.versionScope,
						resolutionSymbolId,
						resolutionConfidence,
						targetRef,
					}),
				);
			});
		});
	}

	console.log(
		`\nParsed: ${stats.pagesIngestable} ingestable, ${stats.pagesSkipped} skipped, ${rows.length} rows assembled.`,
	);
	console.log(`  resolved (top-level): ${stats.resolvedTopLevel}`);
	console.log(`  resolved (local):     ${stats.resolvedLocal}`);
	console.log(`  no-vocabulary:        ${stats.unresolvedNoVocab}`);
	console.log(`  no-match:             ${stats.unresolvedNoMatch}`);
	console.log(`  ambiguous:            ${stats.unresolvedAmbiguous}`);

	if (args.dryRun) {
		console.log("\n--dry-run: skipping DB writes.");
		await db.close();
		return;
	}

	console.log("\nWriting to behavior_notes...");
	await ingestRows(db.sql, sourceId, rows, args.verbose);
	stats.rowsInserted = rows.length;
	console.log(`Done. Inserted ${stats.rowsInserted} behavior_notes rows.`);

	await db.close();
}

main().catch((err) => {
	console.error("Ingest failed:", err);
	process.exit(1);
});
