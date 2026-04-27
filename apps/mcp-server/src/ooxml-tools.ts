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
import {
	type AttrEntry,
	type ChildEdge,
	type EnumEntry,
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

export const OOXML_TOOL_DEFS = [
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
];

export type OoxmlToolName =
	| "ooxml_element"
	| "ooxml_type"
	| "ooxml_children"
	| "ooxml_attributes"
	| "ooxml_enum"
	| "ooxml_namespace";

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
			return formatSymbolReport("Element", hit, profile);
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
			return formatSymbolReport(
				hit.kind === "simpleType" ? "SimpleType" : "ComplexType",
				hit,
				profile,
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

		default: {
			const _exhaustive: never = name;
			throw new Error(`Unhandled OOXML tool: ${_exhaustive}`);
		}
	}
}

// --- Formatting --------------------------------------------------------

function formatSymbolReport(label: string, hit: SymbolHit, profile: string): string {
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
