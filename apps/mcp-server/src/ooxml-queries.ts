/**
 * Read-only schema-graph queries powering the Phase 4 MCP tools:
 *   ooxml_lookup_element, ooxml_lookup_type, ooxml_children,
 *   ooxml_attributes, ooxml_enum, ooxml_namespace_info.
 *
 * These take a tagged-template SQL function (Neon in the deployed Worker,
 * postgres.js in local tests). All queries are profile-scoped and walk
 * inheritance chains where it matters.
 */

// biome-ignore lint/suspicious/noExplicitAny: tagged-template sql differs between neon and postgres.
type Sql = any;

/**
 * Common OOXML prefix -> namespace map for parsing user qnames like "w:tbl".
 * Documents may use other bindings; for those, callers can pass Clark form
 * `{namespace}localName` or just `localName` and accept the WML default.
 */
const COMMON_PREFIXES: Record<string, string> = {
	w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
	r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
	s: "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes",
	m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
	a: "http://schemas.openxmlformats.org/drawingml/2006/main",
	wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
	pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
	c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
	dgm: "http://schemas.openxmlformats.org/drawingml/2006/diagram",
	xsd: "http://www.w3.org/2001/XMLSchema",
	xs: "http://www.w3.org/2001/XMLSchema",
	xml: "http://www.w3.org/XML/1998/namespace",
};

const DEFAULT_NAMESPACE = COMMON_PREFIXES.w;

export interface ParsedQName {
	namespace: string;
	localName: string;
	rawPrefix: string | null;
}

export type QNameParseResult =
	| { ok: true; qname: ParsedQName }
	| { ok: false; reason: string };

/**
 * Parse a user-supplied qname. Accepts:
 *   - `prefix:localName` for known OOXML prefixes (w, r, s, m, a, wp, pic, c, dgm, xsd, xml)
 *   - `{namespace}localName` Clark form
 *   - bare `localName` (assumes WML main namespace)
 */
export function parseQName(raw: string): QNameParseResult {
	if (!raw) return { ok: false, reason: "empty qname" };
	if (raw.startsWith("{")) {
		const close = raw.indexOf("}");
		if (close < 0) return { ok: false, reason: "malformed Clark qname (missing })" };
		const namespace = raw.slice(1, close);
		const localName = raw.slice(close + 1);
		if (!localName) return { ok: false, reason: "missing local name in Clark qname" };
		return { ok: true, qname: { namespace, localName, rawPrefix: null } };
	}
	const colon = raw.indexOf(":");
	if (colon < 0) {
		return {
			ok: true,
			qname: { namespace: DEFAULT_NAMESPACE, localName: raw, rawPrefix: null },
		};
	}
	const prefix = raw.slice(0, colon);
	const localName = raw.slice(colon + 1);
	const namespace = COMMON_PREFIXES[prefix];
	if (!namespace) {
		return {
			ok: false,
			reason: `unknown prefix '${prefix}'. Use a known prefix (w, r, s, m, a, wp, pic, c, dgm), or Clark form {namespace}localName.`,
		};
	}
	return { ok: true, qname: { namespace, localName, rawPrefix: prefix } };
}

export interface SymbolHit {
	id: number;
	vocabularyId: string;
	localName: string;
	kind: string;
	typeRef: string | null;
	namespaceUri: string;
	profileName: string;
	sourceName: string | null;
}

/** Look up a symbol by namespace + localName + kind in a given profile. */
export async function lookupSymbol(
	sql: Sql,
	namespace: string,
	localName: string,
	kind: string,
	profile: string,
): Promise<SymbolHit | null> {
	const rows = await sql`
		SELECT s.id, s.vocabulary_id, s.local_name, s.kind, s.type_ref,
		       ns.uri AS namespace_uri, p.name AS profile_name, src.name AS source_name
		FROM xsd_symbols s
		JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id
		JOIN xsd_namespaces ns ON ns.id = sp.namespace_id
		JOIN xsd_profiles p ON p.id = sp.profile_id
		LEFT JOIN reference_sources src ON src.id = sp.source_id
		WHERE s.local_name = ${localName}
		  AND s.kind = ${kind}
		  AND ns.uri = ${namespace}
		  AND p.name = ${profile}
		LIMIT 1
	`;
	const r = rows[0];
	if (!r) return null;
	return {
		id: r.id as number,
		vocabularyId: r.vocabulary_id as string,
		localName: r.local_name as string,
		kind: r.kind as string,
		typeRef: r.type_ref as string | null,
		namespaceUri: r.namespace_uri as string,
		profileName: r.profile_name as string,
		sourceName: r.source_name as string | null,
	};
}

/** Look up an element by qname in a profile. */
export function lookupElement(
	sql: Sql,
	namespace: string,
	localName: string,
	profile: string,
): Promise<SymbolHit | null> {
	return lookupSymbol(sql, namespace, localName, "element", profile);
}

/**
 * Look up a type symbol (complexType OR simpleType) by qname.
 * Tries complexType first, then simpleType.
 */
export async function lookupType(
	sql: Sql,
	namespace: string,
	localName: string,
	profile: string,
): Promise<SymbolHit | null> {
	const ct = await lookupSymbol(sql, namespace, localName, "complexType", profile);
	if (ct) return ct;
	return lookupSymbol(sql, namespace, localName, "simpleType", profile);
}

/**
 * Resolve a Clark-style type_ref (e.g. {ns}local) to the type symbol it points at.
 */
export async function lookupSymbolByTypeRef(
	sql: Sql,
	typeRef: string,
	profile: string,
): Promise<SymbolHit | null> {
	if (!typeRef.startsWith("{")) return null;
	const close = typeRef.indexOf("}");
	if (close < 0) return null;
	const namespace = typeRef.slice(1, close);
	const localName = typeRef.slice(close + 1);
	return lookupType(sql, namespace, localName, profile);
}

export interface ChildEdge {
	kind: "element" | "group";
	localName: string;
	vocabularyId: string;
	namespaceUri: string | null;
	minOccurs: number;
	maxOccurs: number | null;
	orderIndex: number;
	compositorKind: string | null;
	compositorId: number | null;
	parentCompositorId: number | null;
	source: "self" | "inherited";
	owningTypeName: string;
}

/**
 * Collect inheritance ancestors of a type symbol (self first, then bases).
 * Each entry is the symbol id and its name for surfacing in responses.
 */
async function collectInheritance(
	sql: Sql,
	rootSymbolId: number,
	profile: string,
): Promise<Array<{ id: number; localName: string; vocabularyId: string }>> {
	const rows = await sql`
		WITH RECURSIVE chain AS (
			SELECT s.id, s.local_name, s.vocabulary_id, 0 AS depth
			FROM xsd_symbols s
			WHERE s.id = ${rootSymbolId}
			UNION ALL
			SELECT base.id, base.local_name, base.vocabulary_id, c.depth + 1
			FROM chain c
			JOIN xsd_inheritance_edges e ON e.symbol_id = c.id
			JOIN xsd_profiles p ON p.id = e.profile_id
			JOIN xsd_symbols base ON base.id = e.base_symbol_id
			WHERE p.name = ${profile}
		)
		SELECT id, local_name, vocabulary_id FROM chain ORDER BY depth
	`;
	return rows.map((r: Record<string, unknown>) => ({
		id: r.id as number,
		localName: r.local_name as string,
		vocabularyId: r.vocabulary_id as string,
	}));
}

/**
 * Children of a type symbol, walking inheritance to union the bases' content.
 * Returns elements (from xsd_child_edges) and group refs (from xsd_group_edges
 * with ref_kind='group') in document order. Group refs are returned as-is;
 * callers who want them flattened can call getChildren on the referenced group.
 */
export async function getChildren(
	sql: Sql,
	rootSymbolId: number,
	profile: string,
): Promise<ChildEdge[]> {
	const chain = await collectInheritance(sql, rootSymbolId, profile);
	if (chain.length === 0) return [];

	const out: ChildEdge[] = [];
	for (const ancestor of chain) {
		const elemRows = await sql`
			SELECT s.local_name, s.vocabulary_id, ns.uri AS namespace_uri,
			       e.min_occurs, e.max_occurs, e.order_index,
			       c.kind AS compositor_kind, c.id AS compositor_id, c.parent_compositor_id
			FROM xsd_child_edges e
			JOIN xsd_symbols s ON s.id = e.child_symbol_id
			LEFT JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id AND sp.profile_id = e.profile_id
			LEFT JOIN xsd_namespaces ns ON ns.id = sp.namespace_id
			JOIN xsd_compositors c ON c.id = e.compositor_id
			JOIN xsd_profiles p ON p.id = e.profile_id
			WHERE e.parent_symbol_id = ${ancestor.id} AND p.name = ${profile}
			ORDER BY e.order_index
		`;
		const groupRows = await sql`
			SELECT g.local_name, g.vocabulary_id,
			       ge.min_occurs, ge.max_occurs, ge.order_index,
			       c.kind AS compositor_kind, ge.compositor_id, c.parent_compositor_id
			FROM xsd_group_edges ge
			JOIN xsd_symbols g ON g.id = ge.group_symbol_id
			LEFT JOIN xsd_compositors c ON c.id = ge.compositor_id
			JOIN xsd_profiles p ON p.id = ge.profile_id
			WHERE ge.parent_symbol_id = ${ancestor.id}
			  AND ge.ref_kind = 'group'
			  AND p.name = ${profile}
			ORDER BY ge.order_index
		`;

		const ancestorEntries: ChildEdge[] = [];
		for (const r of elemRows) {
			ancestorEntries.push({
				kind: "element",
				localName: r.local_name as string,
				vocabularyId: r.vocabulary_id as string,
				namespaceUri: (r.namespace_uri as string | null) ?? null,
				minOccurs: r.min_occurs as number,
				maxOccurs: r.max_occurs as number | null,
				orderIndex: r.order_index as number,
				compositorKind: r.compositor_kind as string | null,
				compositorId: r.compositor_id as number | null,
				parentCompositorId: r.parent_compositor_id as number | null,
				source: ancestor.id === rootSymbolId ? "self" : "inherited",
				owningTypeName: ancestor.localName,
			});
		}
		for (const r of groupRows) {
			ancestorEntries.push({
				kind: "group",
				localName: r.local_name as string,
				vocabularyId: r.vocabulary_id as string,
				namespaceUri: null,
				minOccurs: r.min_occurs as number,
				maxOccurs: r.max_occurs as number | null,
				orderIndex: r.order_index as number,
				compositorKind: r.compositor_kind as string | null,
				compositorId: r.compositor_id as number | null,
				parentCompositorId: r.parent_compositor_id as number | null,
				source: ancestor.id === rootSymbolId ? "self" : "inherited",
				owningTypeName: ancestor.localName,
			});
		}
		ancestorEntries.sort((a, b) => a.orderIndex - b.orderIndex);
		out.push(...ancestorEntries);
	}
	return out;
}

export interface AttrEntry {
	localName: string;
	attrUse: "required" | "optional" | "prohibited";
	defaultValue: string | null;
	fixedValue: string | null;
	typeRef: string | null;
	source: "self" | "inherited" | "attributeGroup";
	owningName: string;
}

/**
 * Attributes on a type symbol, including those from base types (inheritance)
 * and from attributeGroup refs (recursively).
 */
export async function getAttributes(
	sql: Sql,
	rootSymbolId: number,
	profile: string,
): Promise<AttrEntry[]> {
	const chain = await collectInheritance(sql, rootSymbolId, profile);
	const out: AttrEntry[] = [];
	const seenAttrs = new Set<string>(); // dedupe by local name; derived overrides base

	for (const ancestor of chain) {
		const directAttrs = await sql`
			SELECT a.local_name, a.attr_use, a.default_value, a.fixed_value, a.type_ref, a.order_index
			FROM xsd_attr_edges a
			JOIN xsd_profiles p ON p.id = a.profile_id
			WHERE a.symbol_id = ${ancestor.id} AND p.name = ${profile}
			ORDER BY a.order_index
		`;
		for (const r of directAttrs) {
			const name = r.local_name as string;
			if (seenAttrs.has(name)) continue;
			seenAttrs.add(name);
			out.push({
				localName: name,
				attrUse: r.attr_use as "required" | "optional" | "prohibited",
				defaultValue: r.default_value as string | null,
				fixedValue: r.fixed_value as string | null,
				typeRef: r.type_ref as string | null,
				source: ancestor.id === rootSymbolId ? "self" : "inherited",
				owningName: ancestor.localName,
			});
		}

		// attributeGroup refs (resolve recursively)
		const agRefs = await sql`
			SELECT ge.group_symbol_id, g.local_name AS group_name
			FROM xsd_group_edges ge
			JOIN xsd_symbols g ON g.id = ge.group_symbol_id
			JOIN xsd_profiles p ON p.id = ge.profile_id
			WHERE ge.parent_symbol_id = ${ancestor.id}
			  AND ge.ref_kind = 'attributeGroup'
			  AND p.name = ${profile}
			ORDER BY ge.order_index
		`;
		for (const ag of agRefs) {
			const groupName = ag.group_name as string;
			const innerChain = await collectInheritance(sql, ag.group_symbol_id as number, profile);
			for (const inner of innerChain) {
				const innerAttrs = await sql`
					SELECT a.local_name, a.attr_use, a.default_value, a.fixed_value, a.type_ref, a.order_index
					FROM xsd_attr_edges a
					JOIN xsd_profiles p ON p.id = a.profile_id
					WHERE a.symbol_id = ${inner.id} AND p.name = ${profile}
					ORDER BY a.order_index
				`;
				for (const r of innerAttrs) {
					const name = r.local_name as string;
					if (seenAttrs.has(name)) continue;
					seenAttrs.add(name);
					out.push({
						localName: name,
						attrUse: r.attr_use as "required" | "optional" | "prohibited",
						defaultValue: r.default_value as string | null,
						fixedValue: r.fixed_value as string | null,
						typeRef: r.type_ref as string | null,
						source: "attributeGroup",
						owningName: groupName,
					});
				}
			}
		}
	}
	return out;
}

export interface EnumEntry {
	value: string;
	orderIndex: number;
}

export async function getEnums(
	sql: Sql,
	symbolId: number,
	profile: string,
): Promise<EnumEntry[]> {
	const rows = await sql`
		SELECT e.value, e.order_index
		FROM xsd_enums e
		JOIN xsd_profiles p ON p.id = e.profile_id
		WHERE e.symbol_id = ${symbolId} AND p.name = ${profile}
		ORDER BY e.order_index
	`;
	return rows.map((r: Record<string, unknown>) => ({
		value: r.value as string,
		orderIndex: r.order_index as number,
	}));
}

export interface NamespaceInfo {
	uri: string;
	vocabularies: string[];
	profiles: Array<{ name: string; symbolCount: number }>;
}

export async function getNamespaceInfo(sql: Sql, uri: string): Promise<NamespaceInfo | null> {
	const nsRows = await sql`SELECT id FROM xsd_namespaces WHERE uri = ${uri} LIMIT 1`;
	if (nsRows.length === 0) return null;
	const nsId = nsRows[0].id as number;

	const profileRows = await sql`
		SELECT p.name AS profile_name, COUNT(*)::int AS symbol_count,
		       array_agg(DISTINCT s.vocabulary_id) AS vocabularies
		FROM xsd_symbol_profiles sp
		JOIN xsd_profiles p ON p.id = sp.profile_id
		JOIN xsd_symbols s ON s.id = sp.symbol_id
		WHERE sp.namespace_id = ${nsId}
		GROUP BY p.name
		ORDER BY p.name
	`;

	const vocabSet = new Set<string>();
	const profiles: NamespaceInfo["profiles"] = [];
	for (const r of profileRows) {
		profiles.push({
			name: r.profile_name as string,
			symbolCount: r.symbol_count as number,
		});
		for (const v of (r.vocabularies as string[]) ?? []) vocabSet.add(v);
	}
	return { uri, vocabularies: [...vocabSet].sort(), profiles };
}
