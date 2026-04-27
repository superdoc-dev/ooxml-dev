/**
 * Read-only schema-graph queries powering the OOXML MCP tools:
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

export type QNameParseResult = { ok: true; qname: ParsedQName } | { ok: false; reason: string };

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

/**
 * Look up a top-level symbol by namespace + localName + kind in a given profile.
 *
 * Local element symbols (parent_symbol_id IS NOT NULL) are intentionally excluded:
 * an inline `<xsd:element name="X" type="...">` declared in two different
 * complexTypes is two distinct symbols whose identity depends on context. Reach
 * those through `getChildren(parentTypeSymbolId, profile)` instead.
 */
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
		  AND s.parent_symbol_id IS NULL
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
	/** Compositor stack from outermost to direct parent, e.g. ["sequence", "choice(0..unbounded)"]. */
	compositorPath: string[];
	source: "self" | "inherited";
	owningTypeName: string;
}

interface InheritanceEdgeRow {
	baseId: number;
	relation: "extension" | "restriction";
}

async function getInheritanceEdge(
	sql: Sql,
	symbolId: number,
	profile: string,
): Promise<InheritanceEdgeRow | null> {
	const rows = await sql`
		SELECT e.base_symbol_id, e.relation
		FROM xsd_inheritance_edges e
		JOIN xsd_profiles p ON p.id = e.profile_id
		WHERE e.symbol_id = ${symbolId} AND p.name = ${profile}
		LIMIT 1
	`;
	if (rows.length === 0) return null;
	return {
		baseId: rows[0].base_symbol_id as number,
		relation: rows[0].relation as InheritanceEdgeRow["relation"],
	};
}

async function getSymbolName(sql: Sql, symbolId: number): Promise<string> {
	const rows = await sql`SELECT local_name FROM xsd_symbols WHERE id = ${symbolId} LIMIT 1`;
	return (rows[0]?.local_name as string | undefined) ?? "(unknown)";
}

interface CompositorRow {
	id: number;
	kind: "sequence" | "choice" | "all";
	minOccurs: number;
	maxOccurs: number | null;
	orderIndex: number;
}

function formatOccurs(min: number, max: number | null): string {
	const maxStr = max === null ? "unbounded" : String(max);
	if (min === 1 && max === 1) return "1..1";
	return `${min}..${maxStr}`;
}

/**
 * Walk a single compositor's content tree in document order, descending into
 * nested compositors. Each emitted child carries the full compositor path so
 * callers can reconstruct nesting.
 */
async function walkCompositor(
	sql: Sql,
	compositor: CompositorRow,
	profile: string,
	pathSoFar: string[],
	source: ChildEdge["source"],
	owningTypeName: string,
): Promise<ChildEdge[]> {
	const path = [
		...pathSoFar,
		`${compositor.kind}(${formatOccurs(compositor.minOccurs, compositor.maxOccurs)})`,
	];

	const elemRows = await sql`
		SELECT 'element' AS entry_kind, s.local_name, s.vocabulary_id, ns.uri AS namespace_uri,
		       e.min_occurs, e.max_occurs, e.order_index, NULL::int AS nested_compositor_id
		FROM xsd_child_edges e
		JOIN xsd_symbols s ON s.id = e.child_symbol_id
		LEFT JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id AND sp.profile_id = e.profile_id
		LEFT JOIN xsd_namespaces ns ON ns.id = sp.namespace_id
		JOIN xsd_profiles p ON p.id = e.profile_id
		WHERE e.compositor_id = ${compositor.id} AND p.name = ${profile}
	`;
	const groupRows = await sql`
		SELECT 'group' AS entry_kind, g.local_name, g.vocabulary_id, NULL AS namespace_uri,
		       ge.min_occurs, ge.max_occurs, ge.order_index, NULL::int AS nested_compositor_id
		FROM xsd_group_edges ge
		JOIN xsd_symbols g ON g.id = ge.group_symbol_id
		JOIN xsd_profiles p ON p.id = ge.profile_id
		WHERE ge.compositor_id = ${compositor.id} AND ge.ref_kind = 'group' AND p.name = ${profile}
	`;
	const nestedRows = await sql`
		SELECT 'compositor' AS entry_kind, NULL AS local_name, NULL AS vocabulary_id, NULL AS namespace_uri,
		       c.min_occurs, c.max_occurs, c.order_index, c.id AS nested_compositor_id, c.kind
		FROM xsd_compositors c
		JOIN xsd_profiles p ON p.id = c.profile_id
		WHERE c.parent_compositor_id = ${compositor.id} AND p.name = ${profile}
	`;

	const all = [...elemRows, ...groupRows, ...nestedRows];
	all.sort((a, b) => (a.order_index as number) - (b.order_index as number));

	const out: ChildEdge[] = [];
	for (const r of all) {
		if (r.entry_kind === "compositor") {
			const nested: CompositorRow = {
				id: r.nested_compositor_id as number,
				kind: r.kind as CompositorRow["kind"],
				minOccurs: r.min_occurs as number,
				maxOccurs: r.max_occurs as number | null,
				orderIndex: r.order_index as number,
			};
			const inner = await walkCompositor(sql, nested, profile, path, source, owningTypeName);
			out.push(...inner);
		} else {
			out.push({
				kind: r.entry_kind as "element" | "group",
				localName: r.local_name as string,
				vocabularyId: r.vocabulary_id as string,
				namespaceUri: (r.namespace_uri as string | null) ?? null,
				minOccurs: r.min_occurs as number,
				maxOccurs: r.max_occurs as number | null,
				orderIndex: r.order_index as number,
				compositorKind: compositor.kind,
				compositorId: compositor.id,
				parentCompositorId: null,
				compositorPath: path,
				source,
				owningTypeName,
			});
		}
	}
	return out;
}

/**
 * Children of a type symbol in correct document order. Walks inheritance per
 * XSD semantics: complexContent/extension prepends the base's effective content
 * before the derived type's; complexContent/restriction REPLACES the base's
 * content (we don't include the base). Within a type, walks the compositor
 * tree DFS so nested sequences/choices flatten in document order.
 *
 * Group refs are returned as edges; resolve them by calling getChildren on the
 * group symbol.
 */
export async function getChildren(
	sql: Sql,
	rootSymbolId: number,
	profile: string,
): Promise<ChildEdge[]> {
	return getChildrenRecursive(sql, rootSymbolId, profile, true);
}

async function getChildrenRecursive(
	sql: Sql,
	symbolId: number,
	profile: string,
	isRoot: boolean,
): Promise<ChildEdge[]> {
	const out: ChildEdge[] = [];

	// Inheritance: extension prepends base content; restriction replaces it.
	// Recursing with isRoot=false sets source="inherited" inside the base call,
	// so we just push the entries through.
	const inherit = await getInheritanceEdge(sql, symbolId, profile);
	if (inherit && inherit.relation === "extension") {
		const base = await getChildrenRecursive(sql, inherit.baseId, profile, false);
		out.push(...base);
	}

	// Walk this type's own top-level compositors.
	const topCompositors = await sql`
		SELECT c.id, c.kind, c.min_occurs, c.max_occurs, c.order_index
		FROM xsd_compositors c
		JOIN xsd_profiles p ON p.id = c.profile_id
		WHERE c.parent_symbol_id = ${symbolId} AND p.name = ${profile}
		ORDER BY c.order_index
	`;
	const ownName = await getSymbolName(sql, symbolId);
	const source: ChildEdge["source"] = isRoot ? "self" : "inherited";
	for (const r of topCompositors) {
		const c: CompositorRow = {
			id: r.id as number,
			kind: r.kind as CompositorRow["kind"],
			minOccurs: r.min_occurs as number,
			maxOccurs: r.max_occurs as number | null,
			orderIndex: r.order_index as number,
		};
		const inner = await walkCompositor(sql, c, profile, [], source, ownName);
		out.push(...inner);
	}

	// Top-level group refs that hang directly off the type (compositor_id IS NULL).
	const topLevelGroups = await sql`
		SELECT g.local_name, g.vocabulary_id, ge.min_occurs, ge.max_occurs, ge.order_index
		FROM xsd_group_edges ge
		JOIN xsd_symbols g ON g.id = ge.group_symbol_id
		JOIN xsd_profiles p ON p.id = ge.profile_id
		WHERE ge.parent_symbol_id = ${symbolId}
		  AND ge.ref_kind = 'group'
		  AND ge.compositor_id IS NULL
		  AND p.name = ${profile}
		ORDER BY ge.order_index
	`;
	for (const r of topLevelGroups) {
		out.push({
			kind: "group",
			localName: r.local_name as string,
			vocabularyId: r.vocabulary_id as string,
			namespaceUri: null,
			minOccurs: r.min_occurs as number,
			maxOccurs: r.max_occurs as number | null,
			orderIndex: r.order_index as number,
			compositorKind: null,
			compositorId: null,
			parentCompositorId: null,
			compositorPath: [],
			source,
			owningTypeName: ownName,
		});
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
 * Attributes on a type symbol, applying XSD §3.4.2.2 inheritance:
 *   - extension: derived's own attribute uses are unioned with the base's.
 *   - restriction: derived's attribute uses also union with the base's, with
 *     the derived narrowing or prohibiting individual entries. Restriction
 *     CANNOT silently drop a base attribute; only `use="prohibited"` does.
 *
 * Walk order emits the derived type's own attributes first, then attributeGroup
 * refs the derived holds, then recurses into the base. Names are de-duplicated
 * by first occurrence, so a derived redeclaration wins and base attrs only
 * surface when the derived didn't override them. attributeGroup nesting is
 * walked recursively with a visited-set against cycles.
 */
export async function getAttributes(
	sql: Sql,
	rootSymbolId: number,
	profile: string,
): Promise<AttrEntry[]> {
	const out: AttrEntry[] = [];
	const seenAttrs = new Set<string>();
	const visitedGroups = new Set<number>();
	await collectAttrsForType(sql, rootSymbolId, profile, true, out, seenAttrs, visitedGroups);
	return out;
}

async function collectAttrsForType(
	sql: Sql,
	symbolId: number,
	profile: string,
	isRoot: boolean,
	out: AttrEntry[],
	seenAttrs: Set<string>,
	visitedGroups: Set<number>,
): Promise<void> {
	const ownName = await getSymbolName(sql, symbolId);

	// Direct attribute declarations on this symbol (whether complexType or
	// attributeGroup; both can carry xsd:attribute children). Emit first so
	// derived redeclarations override base attrs found below.
	const directAttrs = await sql`
		SELECT a.local_name, a.attr_use, a.default_value, a.fixed_value, a.type_ref, a.order_index
		FROM xsd_attr_edges a
		JOIN xsd_profiles p ON p.id = a.profile_id
		WHERE a.symbol_id = ${symbolId} AND p.name = ${profile}
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
			source: isRoot ? "self" : "inherited",
			owningName: ownName,
		});
	}

	// attributeGroup refs the derived itself holds; recurse into each before
	// touching the base so a derived's group-bundled attr also wins.
	const agRefs = await sql`
		SELECT ge.group_symbol_id
		FROM xsd_group_edges ge
		JOIN xsd_profiles p ON p.id = ge.profile_id
		WHERE ge.parent_symbol_id = ${symbolId}
		  AND ge.ref_kind = 'attributeGroup'
		  AND p.name = ${profile}
		ORDER BY ge.order_index
	`;
	for (const ag of agRefs) {
		await collectAttrsFromAttributeGroup(
			sql,
			ag.group_symbol_id as number,
			profile,
			out,
			seenAttrs,
			visitedGroups,
		);
	}

	// Inherited base attrs. Both extension and restriction inherit attribute uses
	// per XSD §3.4.2.2; restriction can override or prohibit but cannot drop
	// silently. Dedup by seenAttrs so the derived's redeclarations win.
	const inherit = await getInheritanceEdge(sql, symbolId, profile);
	if (inherit) {
		await collectAttrsForType(sql, inherit.baseId, profile, false, out, seenAttrs, visitedGroups);
	}
}

async function collectAttrsFromAttributeGroup(
	sql: Sql,
	groupSymbolId: number,
	profile: string,
	out: AttrEntry[],
	seenAttrs: Set<string>,
	visitedGroups: Set<number>,
): Promise<void> {
	if (visitedGroups.has(groupSymbolId)) return;
	visitedGroups.add(groupSymbolId);

	const groupName = await getSymbolName(sql, groupSymbolId);

	const directAttrs = await sql`
		SELECT a.local_name, a.attr_use, a.default_value, a.fixed_value, a.type_ref, a.order_index
		FROM xsd_attr_edges a
		JOIN xsd_profiles p ON p.id = a.profile_id
		WHERE a.symbol_id = ${groupSymbolId} AND p.name = ${profile}
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
			source: "attributeGroup",
			owningName: groupName,
		});
	}

	// Nested attributeGroup refs inside this group.
	const innerRefs = await sql`
		SELECT ge.group_symbol_id
		FROM xsd_group_edges ge
		JOIN xsd_profiles p ON p.id = ge.profile_id
		WHERE ge.parent_symbol_id = ${groupSymbolId}
		  AND ge.ref_kind = 'attributeGroup'
		  AND p.name = ${profile}
		ORDER BY ge.order_index
	`;
	for (const ref of innerRefs) {
		await collectAttrsFromAttributeGroup(
			sql,
			ref.group_symbol_id as number,
			profile,
			out,
			seenAttrs,
			visitedGroups,
		);
	}
}

export interface EnumEntry {
	value: string;
	orderIndex: number;
}

export async function getEnums(sql: Sql, symbolId: number, profile: string): Promise<EnumEntry[]> {
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
