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
	getAttributes,
	getChildren,
	getEnums,
	getNamespaceInfo,
	lookupElement,
	lookupSymbol,
	lookupSymbolByTypeRef,
	lookupType,
	type NamespaceInfo,
	parseQName,
	type SymbolHit,
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
		name: "ooxml_behavior",
		description:
			"Look up implementation behavior notes (currently from MS-OI29500: Microsoft Office Implementation Information for ISO/IEC 29500). Returns 'spec says X / Word does Y' divergence claims. Filter by element/type qname, MS section ID (e.g. '17.4.37' or '2.1.149'), source page GUID, free-text query, app (Word/Excel/PowerPoint/Office), or claim_type. At least one filter is required. Most MS-OI29500 entries attach to local element decls and are reachable only through this tool — not via ooxml_element.",
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
];

export type OoxmlToolName =
	| "ooxml_element"
	| "ooxml_type"
	| "ooxml_children"
	| "ooxml_attributes"
	| "ooxml_enum"
	| "ooxml_namespace"
	| "ooxml_behavior";

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
			return formatSymbolReport("Element", hit, profile, notes);
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
			return formatSymbolReport(
				hit.kind === "simpleType" ? "SimpleType" : "ComplexType",
				hit,
				profile,
				notes,
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

		case "ooxml_behavior": {
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
					"`ooxml_behavior` needs at least one of:",
					"- `qname` — element/type name like 'w:tbl' or 'CT_Tbl'",
					"- `section_id` — substring like '17.4.37' or '2.1.149'",
					"- `source_anchor` — MS-OI29500 page GUID",
					"- `query` — free-text search",
					"- `app` — 'Word', 'Excel', 'PowerPoint', or 'Office'",
					"- `claim_type` — e.g. 'does_not_support', 'varies_from_spec'",
				].join("\n");
			}
			const notes = await fetchBehaviorNotes(sql, filter);
			return formatBehaviorReport(notes, filter, qname);
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
		appendBehaviorSection(lines, notes);
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
 * Append a "Behavior notes" section to a structural report. Groups by source
 * page (source_anchor) so multiple claims from the same MS-OI29500 entry stay
 * together.
 */
function appendBehaviorSection(lines: string[], notes: BehaviorNote[]): void {
	lines.push(`## Behavior notes (${notes.length})`);
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
		const src = first.sourceName ? ` — ${first.sourceName}` : "";
		lines.push(`### ${heading}${src}`);
		const url = buildNoteUrl(first.sourceName, first.sourceAnchor);
		if (url) lines.push(`(${url})`);
		for (const n of group) {
			const labelTag = n.claimLabel ? `${n.claimLabel}.` : "-";
			const scopeTag = n.versionScope ? ` _scope: ${n.versionScope}_` : "";
			if (n.standardText) lines.push(`${labelTag} *${n.standardText}*`);
			if (n.behaviorText)
				lines.push(`    - ${n.behaviorText} \`(${n.app}, ${n.claimType})\`${scopeTag}`);
			else lines.push(`    - ${n.summary} \`(${n.app}, ${n.claimType})\`${scopeTag}`);
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
): string {
	const lines: string[] = [];
	const filterDesc: string[] = [];
	if (qname) filterDesc.push(`qname=${qname}`);
	if (filter.sectionId) filterDesc.push(`section=${filter.sectionId}`);
	if (filter.sourceAnchor) filterDesc.push(`anchor=${filter.sourceAnchor}`);
	if (filter.query) filterDesc.push(`query="${filter.query}"`);
	if (filter.app) filterDesc.push(`app=${filter.app}`);
	if (filter.claimType) filterDesc.push(`claim_type=${filter.claimType}`);
	lines.push(`## Behavior notes — ${filterDesc.join(", ")}`);
	lines.push("");
	if (notes.length === 0) {
		lines.push("_no matching behavior notes._");
		return lines.join("\n");
	}
	appendBehaviorSection(lines, notes);
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
