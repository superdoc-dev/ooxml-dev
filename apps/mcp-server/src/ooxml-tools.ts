/**
 * Read-only structural MCP tools backed by the OOXML schema graph.
 *
 * Tools:
 *   ooxml_element, ooxml_type, ooxml_children,
 *   ooxml_attributes, ooxml_enum, ooxml_namespace.
 *
 * Default profile is `transitional`. Future profiles (e.g. word-compatible-docx)
 * will compose Transitional with Office extension schemas.
 */

import { neon } from "@neondatabase/serverless";
import type { ToolDef } from "./mcp";
import {
	type AttrEntry,
	type BehaviorNote,
	type ChildEdge,
	type EnumEntry,
	fetchBehaviorNotes,
	fetchBehaviorNotesBySymbol,
	fetchVerifications,
	fetchWordObservations,
	getAttributes,
	getChildren,
	getEnums,
	getNamespaceInfo,
	lookupElement,
	lookupSymbol,
	lookupSymbolByTypeRef,
	lookupType,
	type NamespaceInfo,
	type NoteVerification,
	parseQName,
	type SymbolHit,
	type WordObservation,
} from "./ooxml-queries";

export const DEFAULT_PROFILE = "transitional";

export interface OoxmlEnv {
	DATABASE_URL: string;
}

export const OOXML_TOOL_DEFS: ToolDef[] = [
	{
		name: "ooxml_element",
		description:
			"Look up an OOXML element by qname in a profile. Returns canonical symbol info (vocabulary, namespace, declared @type, profile membership, source). Accepts 'w:tbl', '{namespace}localName' (Clark form), or bare 'localName' (defaults to wml-main).",
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "Element qname, e.g. 'w:tbl' or '{...}tbl'." },
				profile: {
					type: "string",
					description: "Profile name (default: 'transitional').",
				},
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_type",
		description:
			"Look up a complexType or simpleType by qname in a profile. Tries complexType first, then simpleType.",
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "Type qname, e.g. 'w:CT_Tbl' or 'CT_Tbl'." },
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_children",
		description:
			"List the legal children of an element or complexType in document order. For an element, follows @type to its complexType first. Walks inheritance to union content from base types. Group refs are surfaced as-is; resolve them by calling ooxml_children on the group qname.",
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: {
					type: "string",
					description:
						"Element, complexType, or group qname (e.g. 'w:tbl', 'CT_Tbl', 'EG_PContent').",
				},
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_attributes",
		description:
			"List the attributes of an element or complexType. For an element, follows @type to its complexType first. Walks inheritance and unfolds attributeGroup refs recursively. Each entry includes use (required/optional/prohibited), default, fixed, and type_ref.",
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "Element or complexType qname." },
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_enum",
		description:
			"List enumeration values for a simpleType. Pass the simpleType qname (e.g. 'w:ST_Jc' or 'ST_Jc') and get back the values in declaration order.",
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "simpleType qname." },
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_namespace",
		description:
			"Show what's known about a namespace URI: vocabularies, profiles that include it, and how many symbols each profile contributes.",
		inputSchema: {
			type: "object" as const,
			properties: {
				uri: { type: "string", description: "Namespace URI." },
			},
			required: ["uri"],
		},
	},
	{
		name: "ooxml_implementation_notes",
		description:
			"Microsoft-documented Office implementation notes from MS-OI29500. These are claims Microsoft has published about how Word / Excel / PowerPoint diverge from the spec — they are NOT necessarily verified against the live Word binary. Each row carries a citation back to its source page; some rows also carry linked observations (see ooxml_word_behavior) that confirm, refine, or contradict the claim against an authored fixture. Filter by element/type qname, MS section ID (e.g. '17.4.37' or '2.1.149'), source page GUID, free-text query, app, or claim_type. At least one filter is required. Most entries attach to local element decls and are reachable only through this tool, not via ooxml_element.",
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: {
					type: "string",
					description:
						"Element/type qname like 'w:tbl' or 'CT_Tbl'. Searches behavior notes attached to top-level OR local symbols with this name, plus notes whose target_ref mentions it.",
				},
				section_id: {
					type: "string",
					description:
						"Substring of bn.section_id, e.g. '17.4.37' (ECMA section) or '2.1.149' (MS-OI29500 entry id).",
				},
				source_anchor: {
					type: "string",
					description: "MS-OI29500 page GUID (exact match).",
				},
				query: {
					type: "string",
					description:
						"Free-text ILIKE search across the standard text, the Word-behavior text, and the rendered summary.",
				},
				app: {
					type: "string",
					description: "Filter by app: 'Word', 'Excel', 'PowerPoint', or 'Office'.",
				},
				claim_type: {
					type: "string",
					description:
						"Filter by claim_type: ignores, requires_despite_optional, writes, reads_but_does_not_write, repairs, layout_behavior, does_not_support, varies_from_spec.",
				},
				limit: { type: "number", description: "Max results (default 50)." },
			},
		},
	},
	{
		name: "ooxml_word_behavior",
		description:
			"Ground-truth observations of how Word ACTUALLY behaves, captured from authored Word fixtures (not Microsoft's documented claims). Each observation records a 'before' and 'after' XML fragment plus a finding string, and is optionally linked to one or more documented notes from ooxml_implementation_notes with a status (confirmed / refined / contradicted / not_reproducible). Use this when you need verified facts rather than documented intent. Filter by fixture name, scenario, free-text query, or verification status.",
		inputSchema: {
			type: "object" as const,
			properties: {
				fixture_name: {
					type: "string",
					description: "Exact fixture name, e.g. 'arabic-bold-test'.",
				},
				scenario: {
					type: "string",
					description: "Scenario tag, e.g. 'authored', 'open-and-save', 'open-and-render'.",
				},
				query: {
					type: "string",
					description: "Free-text search across the finding and the before/after XML fragments.",
				},
				status: {
					type: "string",
					description:
						"Filter to observations linked to a note with this status: 'confirmed', 'refined', 'contradicted', 'not_reproducible'.",
				},
				limit: { type: "number", description: "Max results (default 30)." },
			},
		},
	},
];

export type OoxmlToolName =
	| "ooxml_element"
	| "ooxml_type"
	| "ooxml_children"
	| "ooxml_attributes"
	| "ooxml_enum"
	| "ooxml_namespace"
	| "ooxml_implementation_notes"
	| "ooxml_word_behavior";

const OOXML_TOOL_NAMES: ReadonlySet<string> = new Set(OOXML_TOOL_DEFS.map((t) => t.name));

export function isOoxmlTool(name: string): name is OoxmlToolName {
	return OOXML_TOOL_NAMES.has(name);
}

// biome-ignore lint/suspicious/noExplicitAny: neon's tagged template is loosely typed.
type Sql = any;

/**
 * Worker-side entry point: constructs a Neon HTTP client from env and dispatches.
 * Local CLIs and tests should call `runOoxmlTool` directly with their own sql
 * (e.g. postgres.js against a local Postgres) to avoid the Neon HTTP path.
 */
export async function callOoxmlTool(
	name: OoxmlToolName,
	args: Record<string, unknown>,
	env: OoxmlEnv,
): Promise<string> {
	const sql = neon(env.DATABASE_URL);
	return runOoxmlTool(name, args, sql);
}

/**
 * Driver-agnostic dispatch. `sql` is any tagged-template SQL function whose
 * shape matches `(strings, ...values) => Promise<row[]>` (Neon and postgres.js
 * both qualify).
 */
export async function runOoxmlTool(
	name: OoxmlToolName,
	args: Record<string, unknown>,
	sql: Sql,
): Promise<string> {
	const profile = (args.profile as string | undefined) ?? DEFAULT_PROFILE;

	switch (name) {
		case "ooxml_element": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			const hit = await lookupElement(sql, q.qname.namespace, q.qname.localName, profile);
			if (!hit) {
				return formatNotFound(
					`element ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
				);
			}
			const notes = await fetchBehaviorNotesBySymbol(sql, hit.id);
			const verifications = await fetchVerifications(
				sql,
				notes.map((n) => n.id),
			);
			return formatSymbolReport("Element", hit, profile, notes, verifications);
		}

		case "ooxml_type": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			const hit = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			if (!hit) {
				return formatNotFound(
					`type ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
				);
			}
			const notes = await fetchBehaviorNotesBySymbol(sql, hit.id);
			const verifications = await fetchVerifications(
				sql,
				notes.map((n) => n.id),
			);
			return formatSymbolReport(
				hit.kind === "simpleType" ? "SimpleType" : "ComplexType",
				hit,
				profile,
				notes,
				verifications,
			);
		}

		case "ooxml_children": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);

			let typeSym = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			let elementSym: SymbolHit | null = null;
			if (!typeSym) {
				elementSym = await lookupElement(sql, q.qname.namespace, q.qname.localName, profile);
				if (elementSym?.typeRef) {
					typeSym = await lookupSymbolByTypeRef(sql, elementSym.typeRef, profile);
				} else if (!elementSym) {
					// Fall back to looking for a named xsd:group with this qname (so
					// EG_PContent and friends are reachable directly).
					typeSym = await lookupSymbol(sql, q.qname.namespace, q.qname.localName, "group", profile);
				}
			}
			if (!typeSym) {
				return formatNotFound(
					`children for ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
				);
			}
			const children = await getChildren(sql, typeSym.id, profile);
			return formatChildrenReport(elementSym, typeSym, children, profile);
		}

		case "ooxml_attributes": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			let typeSym = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			let elementSym: SymbolHit | null = null;
			if (!typeSym) {
				elementSym = await lookupElement(sql, q.qname.namespace, q.qname.localName, profile);
				if (elementSym?.typeRef) {
					typeSym = await lookupSymbolByTypeRef(sql, elementSym.typeRef, profile);
				}
			}
			if (!typeSym) {
				return formatNotFound(
					`attributes for ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
				);
			}
			const attrs = await getAttributes(sql, typeSym.id, profile);
			return formatAttributesReport(elementSym, typeSym, attrs, profile);
		}

		case "ooxml_enum": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			const sym = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			if (!sym || sym.kind !== "simpleType") {
				return formatNotFound(
					`simpleType ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
				);
			}
			const enums = await getEnums(sql, sym.id, profile);
			return formatEnumReport(sym, enums, profile);
		}

		case "ooxml_namespace": {
			const uri = String(args.uri ?? "");
			if (!uri) return formatNotFound("namespace URI not provided");
			const info = await getNamespaceInfo(sql, uri);
			if (!info) return formatNotFound(`namespace URI '${uri}' not present in any profile`);
			return formatNamespaceReport(info);
		}

		case "ooxml_implementation_notes": {
			// fall through to existing handler logic; verifications are fetched
			// after the notes query so we can render the [confirmed]/[refined]/etc
			// badges in the dedicated tool's output too.
			const filter: Parameters<typeof fetchBehaviorNotes>[1] = {
				app: args.app as string | undefined,
				claimType: args.claim_type as string | undefined,
				sourceAnchor: args.source_anchor as string | undefined,
				sectionId: args.section_id as string | undefined,
				query: args.query as string | undefined,
				limit: args.limit as number | undefined,
			};
			const qname = args.qname as string | undefined;
			if (qname) {
				const q = parseQName(qname);
				if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
				filter.symbolName = q.qname.localName;
				filter.symbolNamespace = q.qname.namespace;
			}
			if (
				!filter.symbolName &&
				!filter.sectionId &&
				!filter.sourceAnchor &&
				!filter.query &&
				!filter.app &&
				!filter.claimType
			) {
				return [
					"## Missing filter",
					"",
					"`ooxml_implementation_notes` needs at least one of:",
					"- `qname` - element/type name like 'w:tbl' or 'CT_Tbl'",
					"- `section_id` - substring like '17.4.37' or '2.1.149'",
					"- `source_anchor` - MS-OI29500 page GUID",
					"- `query` - free-text search",
					"- `app` - 'Word', 'Excel', 'PowerPoint', or 'Office'",
					"- `claim_type` - e.g. 'does_not_support', 'varies_from_spec'",
				].join("\n");
			}
			const notes = await fetchBehaviorNotes(sql, filter);
			const verifications = await fetchVerifications(
				sql,
				notes.map((n) => n.id),
			);
			return formatBehaviorReport(notes, filter, qname, verifications);
		}

		case "ooxml_word_behavior": {
			const filter: Parameters<typeof fetchWordObservations>[1] = {
				fixtureName: args.fixture_name as string | undefined,
				scenario: args.scenario as string | undefined,
				query: args.query as string | undefined,
				status: args.status as string | undefined,
				limit: args.limit as number | undefined,
			};
			const obs = await fetchWordObservations(sql, filter);
			return formatObservationsReport(obs, filter);
		}

		default: {
			const _exhaustive: never = name;
			throw new Error(`Unhandled OOXML tool: ${_exhaustive}`);
		}
	}
}

// --- Formatting --------------------------------------------------------

function formatSymbolReport(
	label: string,
	hit: SymbolHit,
	profile: string,
	notes: BehaviorNote[] = [],
	verifications: Map<number, NoteVerification> = new Map(),
): string {
	const lines: string[] = [];
	lines.push(`## ${label}: ${hit.localName}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(
		`- canonical: (vocabulary=${hit.vocabularyId}, kind=${hit.kind}, name=${hit.localName})`,
	);
	lines.push(`- namespace: ${hit.namespaceUri}`);
	if (hit.typeRef) lines.push(`- type_ref: ${hit.typeRef}`);
	if (hit.sourceName) lines.push(`- source: ${hit.sourceName}`);
	if (notes.length > 0) {
		lines.push("");
		appendBehaviorSection(lines, notes, verifications);
	}
	return lines.join("\n");
}

/**
 * Per-page Learn URL for a behavior-note source. The `reference_sources.url`
 * stored in the manifest is the doc landing page (with its own GUID). Naively
 * appending `/<source_anchor>` produced `.../ms-oi29500/<landing-guid>/<note-guid>`,
 * which 404s. Each known source maps to a fixed page-base path; we append
 * source_anchor to that.
 */
const SOURCE_PAGE_BASE: Record<string, string> = {
	"ms-oi29500": "https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500",
};

function buildNoteUrl(sourceName: string | null, anchor: string | null): string | null {
	if (!sourceName || !anchor) return null;
	const base = SOURCE_PAGE_BASE[sourceName];
	return base ? `${base}/${anchor}` : null;
}

/**
 * Append a "Documented behavior notes" section to a structural report. These
 * are claims Microsoft has documented; rows linked to a Word fixture
 * observation get a [confirmed] / [refined] / [contradicted] /
 * [not_reproducible] tag, otherwise [unverified].
 */
function appendBehaviorSection(
	lines: string[],
	notes: BehaviorNote[],
	verifications: Map<number, NoteVerification>,
): void {
	lines.push(`## Documented behavior notes (${notes.length}, MS-OI29500)`);
	lines.push("");
	lines.push(
		"_Microsoft-documented claims. Rows tagged [unverified] have not been checked against authored Word fixtures; use ooxml_word_behavior to see which ones are._",
	);
	lines.push("");
	const byAnchor = new Map<string, BehaviorNote[]>();
	for (const n of notes) {
		const k = n.sourceAnchor ?? "(no anchor)";
		if (!byAnchor.has(k)) byAnchor.set(k, []);
		byAnchor.get(k)?.push(n);
	}
	for (const [_anchor, group] of byAnchor) {
		const first = group[0];
		const heading = first.sectionId ? `${first.sectionId}` : (first.sourceAnchor ?? "(no anchor)");
		const src = first.sourceName ? ` - ${first.sourceName}` : "";
		lines.push(`### ${heading}${src}`);
		const url = buildNoteUrl(first.sourceName, first.sourceAnchor);
		if (url) lines.push(`(${url})`);
		for (const n of group) {
			const labelTag = n.claimLabel ? `${n.claimLabel}.` : "-";
			const scopeTag = n.versionScope ? ` _scope: ${n.versionScope}_` : "";
			const v = verifications.get(n.id);
			const verifyTag = v ? `[${v.status}]` : "[unverified]";
			if (n.standardText) lines.push(`${labelTag} *${n.standardText}*`);
			const claim = n.behaviorText ?? n.summary;
			lines.push(`    - ${claim} \`(${n.app}, ${n.claimType})\` ${verifyTag}${scopeTag}`);
			if (v) {
				lines.push(`      observation: ${v.observationFinding}`);
				if (v.fixtureName) {
					const wv = v.wordVersion ? `, ${v.wordVersion}` : "";
					lines.push(`      fixture: ${v.fixtureName}${wv}`);
				}
			}
		}
		lines.push("");
	}
}

function formatBehaviorReport(
	notes: BehaviorNote[],
	filter: {
		symbolName?: string;
		sectionId?: string;
		sourceAnchor?: string;
		query?: string;
		app?: string;
		claimType?: string;
	},
	qname: string | undefined,
	verifications: Map<number, NoteVerification> = new Map(),
): string {
	const lines: string[] = [];
	const filterDesc: string[] = [];
	if (qname) filterDesc.push(`qname=${qname}`);
	if (filter.sectionId) filterDesc.push(`section=${filter.sectionId}`);
	if (filter.sourceAnchor) filterDesc.push(`anchor=${filter.sourceAnchor}`);
	if (filter.query) filterDesc.push(`query="${filter.query}"`);
	if (filter.app) filterDesc.push(`app=${filter.app}`);
	if (filter.claimType) filterDesc.push(`claim_type=${filter.claimType}`);
	lines.push(`## Documented implementation notes (MS-OI29500) - ${filterDesc.join(", ")}`);
	lines.push("");
	if (notes.length === 0) {
		lines.push("_no matching notes._");
		return lines.join("\n");
	}
	appendBehaviorSection(lines, notes, verifications);
	return lines.join("\n");
}

function formatObservationsReport(
	observations: WordObservation[],
	filter: { fixtureName?: string; scenario?: string; query?: string; status?: string },
): string {
	const filterDesc: string[] = [];
	if (filter.fixtureName) filterDesc.push(`fixture=${filter.fixtureName}`);
	if (filter.scenario) filterDesc.push(`scenario=${filter.scenario}`);
	if (filter.query) filterDesc.push(`query="${filter.query}"`);
	if (filter.status) filterDesc.push(`status=${filter.status}`);
	const lines: string[] = [];
	lines.push(`## Word observations (ground truth) - ${filterDesc.join(", ") || "all"}`);
	lines.push("");
	if (observations.length === 0) {
		lines.push("_no matching observations._");
		return lines.join("\n");
	}
	lines.push(
		"_Each observation is a finding from an authored Word fixture. Linked notes carry a verification status: confirmed / refined / contradicted / not_reproducible._",
	);
	lines.push("");
	for (const o of observations) {
		const fix = o.fixtureName
			? `${o.fixtureName}${o.wordVersion ? ` (${o.wordVersion})` : ""}`
			: "(no fixture)";
		lines.push(`### ${fix} - ${o.scenario}`);
		lines.push(`Finding: ${o.finding}`);
		if (o.beforeXml) lines.push(`\nBefore:\n\`\`\`xml\n${o.beforeXml}\n\`\`\``);
		if (o.afterXml) lines.push(`\nAfter:\n\`\`\`xml\n${o.afterXml}\n\`\`\``);
		if (o.linkedNotes.length > 0) {
			lines.push("");
			lines.push("Linked notes:");
			for (const ln of o.linkedNotes) {
				const cite = ln.sectionId ?? `note ${ln.noteId}`;
				const note = ln.notes ? ` - ${ln.notes}` : "";
				lines.push(`  - [${ln.status}] ${cite}${note}`);
			}
		}
		lines.push("");
	}
	return lines.join("\n");
}

function formatChildrenReport(
	element: SymbolHit | null,
	type: SymbolHit,
	children: ChildEdge[],
	profile: string,
): string {
	const lines: string[] = [];
	const heading = element
		? `Children of ${element.localName} (via type ${type.localName})`
		: `Children of ${type.localName}`;
	lines.push(`## ${heading}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(`- type vocabulary: ${type.vocabularyId}`);
	lines.push(`- type namespace: ${type.namespaceUri}`);
	if (type.sourceName) lines.push(`- source: ${type.sourceName}`);
	lines.push("");

	if (children.length === 0) {
		lines.push("_no direct or inherited children._");
		return lines.join("\n");
	}

	lines.push("| order | kind | name | min | max | compositor | from |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- |");
	for (const c of children) {
		const max = c.maxOccurs === null ? "unbounded" : String(c.maxOccurs);
		const comp = c.compositorKind ?? "-";
		const from = c.source === "self" ? "self" : `inherited (${c.owningTypeName})`;
		lines.push(
			`| ${c.orderIndex} | ${c.kind} | ${c.localName} | ${c.minOccurs} | ${max} | ${comp} | ${from} |`,
		);
	}
	lines.push("");
	lines.push(
		"_group entries are returned as-is; call `ooxml_children` on the group qname to expand them._",
	);
	return lines.join("\n");
}

function formatAttributesReport(
	element: SymbolHit | null,
	type: SymbolHit,
	attrs: AttrEntry[],
	profile: string,
): string {
	const lines: string[] = [];
	const heading = element
		? `Attributes of ${element.localName} (via type ${type.localName})`
		: `Attributes of ${type.localName}`;
	lines.push(`## ${heading}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(`- type vocabulary: ${type.vocabularyId}`);
	if (type.sourceName) lines.push(`- source: ${type.sourceName}`);
	lines.push("");

	if (attrs.length === 0) {
		lines.push("_no attributes._");
		return lines.join("\n");
	}

	lines.push("| name | use | type | default | fixed | from |");
	lines.push("| --- | --- | --- | --- | --- | --- |");
	for (const a of attrs) {
		const from =
			a.source === "self"
				? "self"
				: a.source === "inherited"
					? `inherited (${a.owningName})`
					: `attributeGroup (${a.owningName})`;
		lines.push(
			`| ${a.localName} | ${a.attrUse} | ${a.typeRef ?? "-"} | ${a.defaultValue ?? "-"} | ${a.fixedValue ?? "-"} | ${from} |`,
		);
	}
	return lines.join("\n");
}

function formatEnumReport(sym: SymbolHit, enums: EnumEntry[], profile: string): string {
	const lines: string[] = [];
	lines.push(`## Enum values for ${sym.localName}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(`- vocabulary: ${sym.vocabularyId}`);
	lines.push(`- namespace: ${sym.namespaceUri}`);
	if (sym.sourceName) lines.push(`- source: ${sym.sourceName}`);
	lines.push("");
	if (enums.length === 0) {
		lines.push("_no enum values; this simpleType is constrained by base type or pattern only._");
	} else {
		for (const e of enums) lines.push(`- ${e.value}`);
	}
	return lines.join("\n");
}

function formatNamespaceReport(info: NamespaceInfo): string {
	const lines: string[] = [];
	lines.push(`## Namespace ${info.uri}`);
	lines.push("");
	lines.push(`- vocabularies: ${info.vocabularies.join(", ") || "(none)"}`);
	if (info.profiles.length === 0) {
		lines.push("- profiles: (no symbols in any profile)");
	} else {
		lines.push("- profiles:");
		for (const p of info.profiles) lines.push(`  - ${p.name}: ${p.symbolCount} symbols`);
	}
	return lines.join("\n");
}

function formatNotFound(what: string, profile?: string): string {
	const lines: string[] = [];
	lines.push(`## Not found: ${what}`);
	if (profile) lines.push(`Searched in profile '${profile}'.`);
	lines.push("");
	lines.push("Try one of:");
	lines.push("- a known prefix qname like `w:tbl`, `r:id`, `s:ST_OnOff`, `m:oMath`, `a:blip`");
	lines.push("- Clark form `{namespace-uri}localName`");
	lines.push("- a different profile (currently only `transitional` is populated)");
	return lines.join("\n");
}
