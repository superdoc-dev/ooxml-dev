/**
 * Ingest the OOXML schema graph from parseSchemaSet output. Runs in a single
 * transaction and writes:
 *
 *   - xsd_profiles, xsd_namespaces, xsd_symbols, xsd_symbol_profiles
 *     (bootstrap + per-symbol membership; symbol/inheritance passes use
 *     ON CONFLICT for natural-key idempotency)
 *   - xsd_inheritance_edges (complexContent/simpleContent extension/restriction
 *     and simpleType restriction)
 *   - xsd_compositors, xsd_child_edges, xsd_group_edges (content models;
 *     content-model rows have no natural unique key, so this pass uses
 *     delete-and-rewrite per profile)
 *   - xsd_attr_edges, xsd_enums (attributes, attributeGroup refs, and
 *     simpleType enumeration values; same delete-and-rewrite pattern)
 *
 * Re-running against the same source is idempotent: identical row counts on
 * every run. Stale-row cleanup (when symbols vanish in a future edition) is
 * deferred until needed.
 *
 * Library usage:
 *   await ingestSchemaSet({ schemaDir, entrypoints, profileName, sourceName, db })
 *
 * CLI usage:
 *   bun run xsd:ingest
 *   bun run xsd:ingest --schema-dir <dir> --entrypoint wml.xsd \
 *                      --profile transitional --source ecma-376-transitional
 */

import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";
import { nodeAttrs } from "./ast.ts";
import { parseSchemaSet } from "./parse-schema.ts";
import { resolveQNameAttr } from "./qname.ts";
import type { Declaration, ParsedSchemaSet, PreserveOrderNode } from "./types.ts";
import { vocabularyForNamespace } from "./vocabulary.ts";

// biome-ignore lint/suspicious/noExplicitAny: postgres library typing is intricate; helpers stay generic.
type Sql = any;

export interface IngestSchemaSetOptions {
	schemaDir: string;
	entrypoints: string[];
	/** Profile name to attach symbols to (e.g. "transitional"). Bootstrap if missing. */
	profileName: string;
	/** Source name in reference_sources; used for source_id on xsd_symbol_profiles. */
	sourceName: string;
	/** Existing DbClient. The ingest opens its own transaction inside. */
	db: DbClient;
}

export interface IngestStats {
	documents: number;
	symbolsInserted: number;
	symbolsExisting: number;
	namespacesEnsured: number;
	profileMembershipsInserted: number;
	inheritanceEdgesInserted: number;
	inheritanceUnresolved: number;
	compositorsInserted: number;
	childEdgesInserted: number;
	childEdgesUnresolved: number;
	groupRefsInserted: number;
	groupRefsUnresolved: number;
	localElementsCreated: number;
	attrEdgesInserted: number;
	attrEdgesUnresolved: number;
	attrGroupRefsInserted: number;
	attrGroupRefsUnresolved: number;
	enumsInserted: number;
}

export async function ingestSchemaSet(opts: IngestSchemaSetOptions): Promise<IngestStats> {
	const parseResult = await parseSchemaSet({
		schemaDir: opts.schemaDir,
		entrypoints: opts.entrypoints,
	});

	const stats: IngestStats = {
		documents: parseResult.documents.size,
		symbolsInserted: 0,
		symbolsExisting: 0,
		namespacesEnsured: 0,
		profileMembershipsInserted: 0,
		inheritanceEdgesInserted: 0,
		inheritanceUnresolved: 0,
		compositorsInserted: 0,
		childEdgesInserted: 0,
		childEdgesUnresolved: 0,
		groupRefsInserted: 0,
		groupRefsUnresolved: 0,
		localElementsCreated: 0,
		attrEdgesInserted: 0,
		attrEdgesUnresolved: 0,
		attrGroupRefsInserted: 0,
		attrGroupRefsUnresolved: 0,
		enumsInserted: 0,
	};

	await opts.db.sql.begin(async (sql: Sql) => {
		const profileId = await ensureProfile(sql, opts.profileName);
		const sourceId = await lookupSourceId(sql, opts.sourceName);

		// Purge anything this source previously wrote so re-ingest is a clean
		// rewrite and tolerant of schema migrations that change the symbol
		// shape (e.g. the addition of parent_symbol_id for local-element
		// scoping).
		//
		// Several FKs reference xsd_symbols.id WITHOUT cascade
		// (xsd_inheritance_edges.base_symbol_id, xsd_child_edges.child_symbol_id,
		// xsd_attr_edges.attr_symbol_id, xsd_group_edges.group_symbol_id), so
		// those rows must be cleaned explicitly before the symbol delete. The
		// LHS FKs (parent_symbol_id, symbol_id) DO cascade, as does
		// xsd_symbol_profiles.symbol_id and behavior_notes.symbol_id. (When
		// curated behavior_notes start landing, switch to natural-key
		// reconciliation rather than cascade-delete.)
		await sql`
			DELETE FROM xsd_inheritance_edges
			WHERE base_symbol_id IN (SELECT symbol_id FROM xsd_symbol_profiles WHERE source_id = ${sourceId})
		`;
		await sql`
			DELETE FROM xsd_child_edges
			WHERE child_symbol_id IN (SELECT symbol_id FROM xsd_symbol_profiles WHERE source_id = ${sourceId})
		`;
		await sql`
			DELETE FROM xsd_attr_edges
			WHERE attr_symbol_id IN (SELECT symbol_id FROM xsd_symbol_profiles WHERE source_id = ${sourceId})
		`;
		await sql`
			DELETE FROM xsd_group_edges
			WHERE group_symbol_id IN (SELECT symbol_id FROM xsd_symbol_profiles WHERE source_id = ${sourceId})
		`;
		await sql`
			DELETE FROM xsd_symbols
			WHERE id IN (SELECT symbol_id FROM xsd_symbol_profiles WHERE source_id = ${sourceId})
		`;

		// Pass 1: namespaces, symbols, profile memberships.
		const namespaceIds = new Map<string, number>();
		const symbolIds = new Map<string, number>(); // canonical (vocab|local|kind) -> id

		for (const doc of parseResult.documents.values()) {
			if (!namespaceIds.has(doc.targetNamespace)) {
				const id = await ensureNamespace(sql, doc.targetNamespace);
				namespaceIds.set(doc.targetNamespace, id);
				stats.namespacesEnsured++;
			}
		}

		for (const decls of parseResult.declarationsByQName.values()) {
			for (const decl of decls) {
				const key = symbolKey(decl.vocabularyId, decl.localName, decl.kind);
				if (symbolIds.has(key)) continue;

				// Capture @type for elements and attributes; resolved Clark-style.
				const typeRef = resolveDeclTypeRef(decl, parseResult);

				const { id, inserted } = await upsertSymbol(
					sql,
					decl.vocabularyId,
					decl.localName,
					decl.kind,
					typeRef,
				);
				symbolIds.set(key, id);
				if (inserted) stats.symbolsInserted++;
				else stats.symbolsExisting++;

				const nsId = namespaceIds.get(decl.namespace);
				if (!nsId) {
					throw new Error(
						`Internal: missing namespace id for ${decl.namespace} (decl ${decl.localName})`,
					);
				}
				const linked = await linkSymbolToProfile(sql, id, profileId, nsId, sourceId);
				if (linked) stats.profileMembershipsInserted++;
			}
		}

		// Pass 2: inheritance edges. Resolve base qname through the document's
		// prefix map; ensure built-in xsd:* placeholders exist on demand.
		for (const decls of parseResult.declarationsByQName.values()) {
			for (const decl of decls) {
				const inherit = findInheritance(decl);
				if (!inherit) continue;

				const prefixMap = parseResult.namespaceByPrefix.get(decl.documentPath);
				if (!prefixMap) continue;
				const resolved = resolveQNameAttr(inherit.baseQName, prefixMap, decl.namespace);
				if (!resolved.resolved) {
					stats.inheritanceUnresolved++;
					continue;
				}
				const baseQ = resolved.qname;
				if (!baseQ.vocabularyId) {
					stats.inheritanceUnresolved++;
					continue;
				}

				// Look up existing symbol; for xsd-builtin, ensure on demand.
				let baseId: number | null = null;
				const candidateKinds: Array<Declaration["kind"]> = [
					"complexType",
					"simpleType",
					"element",
					"group",
					"attributeGroup",
					"attribute",
				];
				for (const k of candidateKinds) {
					const id = symbolIds.get(symbolKey(baseQ.vocabularyId, baseQ.localName, k));
					if (id != null) {
						baseId = id;
						break;
					}
				}
				if (baseId == null && baseQ.vocabularyId === "xsd-builtin") {
					const { id, inserted } = await upsertSymbol(
						sql,
						"xsd-builtin",
						baseQ.localName,
						"simpleType",
					);
					symbolIds.set(symbolKey("xsd-builtin", baseQ.localName, "simpleType"), id);
					baseId = id;
					if (inserted) stats.symbolsInserted++;
					else stats.symbolsExisting++;
					// Link to a profile so ooxml_lookup_type / lookupSymbolByTypeRef can
					// follow type_refs into the W3C XSD namespace.
					let xsdNsId = namespaceIds.get(baseQ.namespace);
					if (xsdNsId == null) {
						xsdNsId = await ensureNamespace(sql, baseQ.namespace);
						namespaceIds.set(baseQ.namespace, xsdNsId);
						stats.namespacesEnsured++;
					}
					const linked = await linkSymbolToProfile(sql, id, profileId, xsdNsId, sourceId);
					if (linked) stats.profileMembershipsInserted++;
				}
				if (baseId == null) {
					stats.inheritanceUnresolved++;
					continue;
				}

				const childId = symbolIds.get(symbolKey(decl.vocabularyId, decl.localName, decl.kind));
				if (childId == null) continue;

				const inserted = await insertInheritance(sql, childId, baseId, profileId, inherit.relation);
				if (inserted) stats.inheritanceEdgesInserted++;
			}
		}

		// Pass 3: content models. Walk every complexType and group declaration,
		// emit xsd_compositors / xsd_child_edges / xsd_group_edges. Local element
		// declarations are deduped under (owner-vocab, name, element); cross-CT
		// reuse of a local name collapses to one symbol.
		//
		// Idempotency strategy: content-model rows have no natural unique key
		// (a single complexType can hold multiple sibling compositors of the same
		// kind), so we delete-and-rewrite per profile. xsd_child_edges FK on
		// xsd_compositors with ON DELETE CASCADE handles child_edges cleanup.
		// Assumes one source per profile, which holds today; revisit when
		// multiple sources contribute to the same profile.
		await sql`DELETE FROM xsd_compositors WHERE profile_id = ${profileId}`;
		await sql`DELETE FROM xsd_group_edges WHERE profile_id = ${profileId}`;

		for (const decls of parseResult.declarationsByQName.values()) {
			for (const decl of decls) {
				if (decl.kind !== "complexType" && decl.kind !== "group") continue;

				const ownerSymbolId = symbolIds.get(
					symbolKey(decl.vocabularyId, decl.localName, decl.kind),
				);
				if (ownerSymbolId == null) continue;
				const prefixMap = parseResult.namespaceByPrefix.get(decl.documentPath);
				if (!prefixMap) continue;

				const ctx: WalkCtx = {
					sql,
					profileId,
					sourceId,
					ownerSymbolId,
					ownerDecl: decl,
					prefixMap,
					symbolIds,
					namespaceIds,
					parseResult,
					stats,
				};

				const particleParents = findContentModelParents(decl);
				let topOrder = 0;
				for (const parent of particleParents) {
					for (const child of nodeChildrenLocal(parent)) {
						const tag = stripPrefixLocal(nodeTagLocal(child));
						if (tag === "sequence" || tag === "choice" || tag === "all") {
							await walkCompositor(child, tag, null, topOrder, ctx);
							topOrder++;
						} else if (tag === "group") {
							await handleGroupRef(child, null, topOrder, ctx);
							topOrder++;
						}
					}
				}
			}
		}

		// Pass 4: attributes, attributeGroup refs, and simpleType enumerations.
		// Same delete-and-rewrite strategy as Pass 3. xsd_group_edges already
		// cleared by Pass 3, so attributeGroup ref inserts here are fresh.
		await sql`DELETE FROM xsd_attr_edges WHERE profile_id = ${profileId}`;
		await sql`DELETE FROM xsd_enums WHERE profile_id = ${profileId}`;

		for (const decls of parseResult.declarationsByQName.values()) {
			for (const decl of decls) {
				const ownerSymbolId = symbolIds.get(
					symbolKey(decl.vocabularyId, decl.localName, decl.kind),
				);
				if (ownerSymbolId == null) continue;
				const prefixMap = parseResult.namespaceByPrefix.get(decl.documentPath);
				if (!prefixMap) continue;

				if (decl.kind === "complexType" || decl.kind === "attributeGroup") {
					const parents = findAttributeParents(decl);
					let order = 0;
					for (const parent of parents) {
						for (const child of nodeChildrenLocal(parent)) {
							const tag = stripPrefixLocal(nodeTagLocal(child));
							if (tag === "attribute") {
								await handleAttribute(
									sql,
									child,
									ownerSymbolId,
									profileId,
									prefixMap,
									decl.namespace,
									symbolIds,
									parseResult,
									order,
									stats,
								);
								order++;
							} else if (tag === "attributeGroup") {
								const a = nodeAttrs(child);
								if (!a.ref) continue;
								const resolved = resolveQNameAttr(a.ref, prefixMap, decl.namespace);
								if (!resolved.resolved || !resolved.qname.vocabularyId) {
									stats.attrGroupRefsUnresolved++;
									continue;
								}
								const groupSymbolId = symbolIds.get(
									symbolKey(
										resolved.qname.vocabularyId,
										resolved.qname.localName,
										"attributeGroup",
									),
								);
								if (groupSymbolId == null) {
									stats.attrGroupRefsUnresolved++;
									continue;
								}
								// attributeGroup refs don't live inside content compositors;
								// compositor_id stays null and min/max default to 1.
								await insertGroupEdge(
									sql,
									ownerSymbolId,
									null,
									groupSymbolId,
									profileId,
									"attributeGroup",
									1,
									1,
									order,
								);
								stats.attrGroupRefsInserted++;
								order++;
							}
						}
					}
				} else if (decl.kind === "simpleType") {
					let order = 0;
					for (const value of findEnumValues(decl)) {
						await insertEnum(sql, ownerSymbolId, profileId, value, order);
						stats.enumsInserted++;
						order++;
					}
				}
			}
		}
	});

	return stats;
}

interface WalkCtx {
	sql: Sql;
	profileId: number;
	sourceId: number;
	ownerSymbolId: number;
	ownerDecl: Declaration;
	prefixMap: Map<string, string>;
	symbolIds: Map<string, number>;
	namespaceIds: Map<string, number>;
	parseResult: ParsedSchemaSet;
	stats: IngestStats;
}

/**
 * Resolve a declaration's @type qname (for top-level element/attribute decls)
 * to Clark-style {namespace}localName, or null if the declaration has no @type.
 */
function resolveDeclTypeRef(decl: Declaration, parseResult: ParsedSchemaSet): string | null {
	if (decl.kind !== "element" && decl.kind !== "attribute") return null;
	const a = nodeAttrs(decl.node);
	if (!a.type) return null;
	const prefixMap = parseResult.namespaceByPrefix.get(decl.documentPath);
	if (!prefixMap) return a.type;
	const r = resolveQNameAttr(a.type, prefixMap, decl.namespace);
	return r.resolved ? `{${r.qname.namespace}}${r.qname.localName}` : a.type;
}

/**
 * For a complexType: yield the node(s) whose direct children are particles
 * (sequence/choice/all/group). That's the complexType itself, OR (for derived
 * types) the inner xsd:extension or xsd:restriction beneath complexContent.
 *
 * For a group definition: yield the group node itself.
 *
 * simpleContent has no element particles; not yielded.
 */
function findContentModelParents(decl: Declaration): PreserveOrderNode[] {
	if (decl.kind === "group") return [decl.node];

	if (decl.kind !== "complexType") return [];

	const out: PreserveOrderNode[] = [];
	let sawComplexContent = false;
	for (const child of nodeChildrenLocal(decl.node)) {
		const tag = stripPrefixLocal(nodeTagLocal(child));
		if (tag === "complexContent") {
			sawComplexContent = true;
			for (const inner of nodeChildrenLocal(child)) {
				const innerTag = stripPrefixLocal(nodeTagLocal(inner));
				if (innerTag === "extension" || innerTag === "restriction") out.push(inner);
			}
		}
	}
	if (sawComplexContent) return out;
	// No complexContent wrapper: particles live directly under complexType.
	return [decl.node];
}

async function walkCompositor(
	node: PreserveOrderNode,
	kind: "sequence" | "choice" | "all",
	parentCompositorId: number | null,
	orderIndex: number,
	ctx: WalkCtx,
): Promise<void> {
	const a = nodeAttrs(node);
	const compositorId = await insertCompositor(
		ctx.sql,
		parentCompositorId === null ? ctx.ownerSymbolId : null,
		parentCompositorId,
		ctx.profileId,
		kind,
		parseMinOccurs(a.minOccurs),
		parseMaxOccurs(a.maxOccurs),
		orderIndex,
	);
	ctx.stats.compositorsInserted++;

	let childOrder = 0;
	for (const child of nodeChildrenLocal(node)) {
		const tag = stripPrefixLocal(nodeTagLocal(child));
		if (tag === "element") {
			await handleElement(child, compositorId, childOrder, ctx);
			childOrder++;
		} else if (tag === "sequence" || tag === "choice" || tag === "all") {
			await walkCompositor(child, tag, compositorId, childOrder, ctx);
			childOrder++;
		} else if (tag === "group") {
			await handleGroupRef(child, compositorId, childOrder, ctx);
			childOrder++;
		}
		// xsd:any: skipped for now.
	}
}

async function handleElement(
	node: PreserveOrderNode,
	compositorId: number,
	orderIndex: number,
	ctx: WalkCtx,
): Promise<void> {
	const a = nodeAttrs(node);
	let childSymbolId: number | null = null;

	if (a.ref) {
		const resolved = resolveQNameAttr(a.ref, ctx.prefixMap, ctx.ownerDecl.namespace);
		if (!resolved.resolved || !resolved.qname.vocabularyId) {
			ctx.stats.childEdgesUnresolved++;
			return;
		}
		const id = ctx.symbolIds.get(
			symbolKey(resolved.qname.vocabularyId, resolved.qname.localName, "element"),
		);
		if (id == null) {
			ctx.stats.childEdgesUnresolved++;
			return;
		}
		childSymbolId = id;
	} else if (a.name) {
		// Resolve @type so ooxml_lookup_element / ooxml_children can follow it.
		let typeRef: string | null = null;
		if (a.type) {
			const r = resolveQNameAttr(a.type, ctx.prefixMap, ctx.ownerDecl.namespace);
			typeRef = r.resolved ? `{${r.qname.namespace}}${r.qname.localName}` : a.type;
		}
		// Local elements are scoped per-owner: the same name in two different
		// complexTypes is not the same symbol (e.g. WML's tblGrid is
		// CT_TblGridBase inside CT_TblGridChange but CT_TblGrid inside CT_Tbl).
		const key = symbolKey(ctx.ownerDecl.vocabularyId, a.name, "element", ctx.ownerSymbolId);
		let id = ctx.symbolIds.get(key);
		if (id == null) {
			const res = await upsertSymbol(
				ctx.sql,
				ctx.ownerDecl.vocabularyId,
				a.name,
				"element",
				typeRef,
				ctx.ownerSymbolId,
			);
			ctx.symbolIds.set(key, res.id);
			if (res.inserted) {
				ctx.stats.symbolsInserted++;
				ctx.stats.localElementsCreated++;
			} else {
				ctx.stats.symbolsExisting++;
			}
			// Local elements need profile membership too, otherwise
			// ooxml_lookup_element won't find them in the transitional profile.
			const nsId = ctx.namespaceIds.get(ctx.ownerDecl.namespace);
			if (nsId != null) {
				const linked = await linkSymbolToProfile(
					ctx.sql,
					res.id,
					ctx.profileId,
					nsId,
					ctx.sourceId,
				);
				if (linked) ctx.stats.profileMembershipsInserted++;
			}
			id = res.id;
		} else if (typeRef) {
			// Existing symbol; ensure type_ref is set if we have one.
			await ctx.sql`
				UPDATE xsd_symbols SET type_ref = ${typeRef}
				WHERE id = ${id} AND type_ref IS NULL
			`;
		}
		childSymbolId = id;
	}

	if (childSymbolId == null) return;

	await insertChildEdge(
		ctx.sql,
		ctx.ownerSymbolId,
		compositorId,
		childSymbolId,
		ctx.profileId,
		parseMinOccurs(a.minOccurs),
		parseMaxOccurs(a.maxOccurs),
		orderIndex,
	);
	ctx.stats.childEdgesInserted++;
}

async function handleGroupRef(
	node: PreserveOrderNode,
	compositorId: number | null,
	orderIndex: number,
	ctx: WalkCtx,
): Promise<void> {
	const a = nodeAttrs(node);
	if (!a.ref) return;
	const resolved = resolveQNameAttr(a.ref, ctx.prefixMap, ctx.ownerDecl.namespace);
	if (!resolved.resolved || !resolved.qname.vocabularyId) {
		ctx.stats.groupRefsUnresolved++;
		return;
	}
	const groupSymbolId = ctx.symbolIds.get(
		symbolKey(resolved.qname.vocabularyId, resolved.qname.localName, "group"),
	);
	if (groupSymbolId == null) {
		ctx.stats.groupRefsUnresolved++;
		return;
	}
	await insertGroupEdge(
		ctx.sql,
		ctx.ownerSymbolId,
		compositorId,
		groupSymbolId,
		ctx.profileId,
		"group",
		parseMinOccurs(a.minOccurs),
		parseMaxOccurs(a.maxOccurs),
		orderIndex,
	);
	ctx.stats.groupRefsInserted++;
}

function parseMinOccurs(raw: string | undefined): number {
	if (raw === undefined) return 1;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) ? n : 1;
}

function parseMaxOccurs(raw: string | undefined): number | null {
	if (raw === undefined) return 1;
	if (raw === "unbounded") return null;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) ? n : 1;
}

// --- DB helpers ----------------------------------------------------------

async function ensureProfile(sql: Sql, name: string): Promise<number> {
	const [row] = await sql`
		INSERT INTO xsd_profiles (name) VALUES (${name})
		ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		RETURNING id
	`;
	return row.id;
}

async function lookupSourceId(sql: Sql, name: string): Promise<number> {
	const [row] = await sql`SELECT id FROM reference_sources WHERE name = ${name} LIMIT 1`;
	if (!row)
		throw new Error(
			`reference_sources row not found for name='${name}'. Run \`bun run sources:sync\` first.`,
		);
	return row.id;
}

async function ensureNamespace(sql: Sql, uri: string): Promise<number> {
	const [row] = await sql`
		INSERT INTO xsd_namespaces (uri) VALUES (${uri})
		ON CONFLICT (uri) DO UPDATE SET uri = EXCLUDED.uri
		RETURNING id
	`;
	return row.id;
}

async function upsertSymbol(
	sql: Sql,
	vocabularyId: string,
	localName: string,
	kind: string,
	typeRef: string | null = null,
	parentSymbolId: number | null = null,
): Promise<{ id: number; inserted: boolean }> {
	const [row] = await sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind, type_ref, parent_symbol_id)
		VALUES (${vocabularyId}, ${localName}, ${kind}, ${typeRef}, ${parentSymbolId})
		ON CONFLICT ON CONSTRAINT xsd_symbols_canonical_key DO UPDATE
			SET type_ref = COALESCE(EXCLUDED.type_ref, xsd_symbols.type_ref)
		RETURNING id, (xmax = 0) AS inserted
	`;
	return { id: row.id, inserted: row.inserted };
}

async function linkSymbolToProfile(
	sql: Sql,
	symbolId: number,
	profileId: number,
	namespaceId: number,
	sourceId: number,
): Promise<boolean> {
	const rows = await sql`
		INSERT INTO xsd_symbol_profiles (symbol_id, profile_id, namespace_id, source_id)
		VALUES (${symbolId}, ${profileId}, ${namespaceId}, ${sourceId})
		ON CONFLICT (symbol_id, profile_id) DO NOTHING
		RETURNING id
	`;
	return rows.length > 0;
}

async function insertInheritance(
	sql: Sql,
	symbolId: number,
	baseSymbolId: number,
	profileId: number,
	relation: "extension" | "restriction",
): Promise<boolean> {
	const rows = await sql`
		INSERT INTO xsd_inheritance_edges (symbol_id, base_symbol_id, profile_id, relation)
		VALUES (${symbolId}, ${baseSymbolId}, ${profileId}, ${relation})
		ON CONFLICT (symbol_id, profile_id) DO NOTHING
		RETURNING id
	`;
	return rows.length > 0;
}

async function insertCompositor(
	sql: Sql,
	parentSymbolId: number | null,
	parentCompositorId: number | null,
	profileId: number,
	kind: "sequence" | "choice" | "all",
	minOccurs: number,
	maxOccurs: number | null,
	orderIndex: number,
): Promise<number> {
	const [row] = await sql`
		INSERT INTO xsd_compositors
			(parent_symbol_id, parent_compositor_id, profile_id, kind, min_occurs, max_occurs, order_index)
		VALUES
			(${parentSymbolId}, ${parentCompositorId}, ${profileId}, ${kind}, ${minOccurs}, ${maxOccurs}, ${orderIndex})
		RETURNING id
	`;
	return row.id;
}

async function insertChildEdge(
	sql: Sql,
	parentSymbolId: number,
	compositorId: number,
	childSymbolId: number,
	profileId: number,
	minOccurs: number,
	maxOccurs: number | null,
	orderIndex: number,
): Promise<void> {
	await sql`
		INSERT INTO xsd_child_edges
			(parent_symbol_id, compositor_id, child_symbol_id, profile_id, min_occurs, max_occurs, order_index)
		VALUES
			(${parentSymbolId}, ${compositorId}, ${childSymbolId}, ${profileId}, ${minOccurs}, ${maxOccurs}, ${orderIndex})
	`;
}

async function insertGroupEdge(
	sql: Sql,
	parentSymbolId: number,
	compositorId: number | null,
	groupSymbolId: number,
	profileId: number,
	refKind: "group" | "attributeGroup",
	minOccurs: number,
	maxOccurs: number | null,
	orderIndex: number,
): Promise<void> {
	await sql`
		INSERT INTO xsd_group_edges
			(parent_symbol_id, compositor_id, group_symbol_id, profile_id, ref_kind, min_occurs, max_occurs, order_index)
		VALUES
			(${parentSymbolId}, ${compositorId}, ${groupSymbolId}, ${profileId}, ${refKind}, ${minOccurs}, ${maxOccurs}, ${orderIndex})
	`;
}

async function insertAttrEdge(
	sql: Sql,
	symbolId: number,
	attrSymbolId: number | null,
	localName: string,
	profileId: number,
	attrUse: "required" | "optional" | "prohibited",
	defaultValue: string | null,
	fixedValue: string | null,
	typeRef: string | null,
	orderIndex: number,
): Promise<void> {
	await sql`
		INSERT INTO xsd_attr_edges
			(symbol_id, attr_symbol_id, local_name, profile_id, attr_use, default_value, fixed_value, type_ref, order_index)
		VALUES
			(${symbolId}, ${attrSymbolId}, ${localName}, ${profileId}, ${attrUse}, ${defaultValue}, ${fixedValue}, ${typeRef}, ${orderIndex})
	`;
}

async function insertEnum(
	sql: Sql,
	symbolId: number,
	profileId: number,
	value: string,
	orderIndex: number,
): Promise<void> {
	await sql`
		INSERT INTO xsd_enums (symbol_id, profile_id, value, order_index)
		VALUES (${symbolId}, ${profileId}, ${value}, ${orderIndex})
	`;
}

/**
 * Locate the nodes whose direct children are xsd:attribute / xsd:attributeGroup.
 * For complexType: the type itself when there's no complexContent/simpleContent
 * wrapper, otherwise the inner extension/restriction nodes.
 * For attributeGroup: the group node itself.
 */
function findAttributeParents(decl: Declaration): PreserveOrderNode[] {
	if (decl.kind === "attributeGroup") return [decl.node];
	if (decl.kind !== "complexType") return [];

	const out: PreserveOrderNode[] = [];
	let sawWrapper = false;
	for (const child of nodeChildrenLocal(decl.node)) {
		const tag = stripPrefixLocal(nodeTagLocal(child));
		if (tag === "complexContent" || tag === "simpleContent") {
			sawWrapper = true;
			for (const inner of nodeChildrenLocal(child)) {
				const innerTag = stripPrefixLocal(nodeTagLocal(inner));
				if (innerTag === "extension" || innerTag === "restriction") out.push(inner);
			}
		}
	}
	if (!sawWrapper) out.push(decl.node);
	return out;
}

/** xsd:simpleType > xsd:restriction > xsd:enumeration values, in order. */
function findEnumValues(decl: Declaration): string[] {
	const values: string[] = [];
	for (const child of nodeChildrenLocal(decl.node)) {
		const tag = stripPrefixLocal(nodeTagLocal(child));
		if (tag !== "restriction") continue;
		for (const e of nodeChildrenLocal(child)) {
			const eTag = stripPrefixLocal(nodeTagLocal(e));
			if (eTag !== "enumeration") continue;
			const a = nodeAttrs(e);
			if (a.value !== undefined) values.push(a.value);
		}
	}
	return values;
}

async function handleAttribute(
	sql: Sql,
	node: PreserveOrderNode,
	ownerSymbolId: number,
	profileId: number,
	prefixMap: Map<string, string>,
	defaultNamespace: string,
	symbolIds: Map<string, number>,
	parseResult: ParsedSchemaSet,
	orderIndex: number,
	stats: IngestStats,
): Promise<void> {
	const a = nodeAttrs(node);
	let localName: string | null = null;
	let attrSymbolId: number | null = null;
	let typeRef: string | null = null;
	let defaultValue: string | null = a.default ?? null;
	let fixedValue: string | null = a.fixed ?? null;

	if (a.ref) {
		const resolved = resolveQNameAttr(a.ref, prefixMap, defaultNamespace);
		if (!resolved.resolved || !resolved.qname.vocabularyId) {
			stats.attrEdgesUnresolved++;
			return;
		}
		localName = resolved.qname.localName;
		const id = symbolIds.get(
			symbolKey(resolved.qname.vocabularyId, resolved.qname.localName, "attribute"),
		);
		if (id != null) attrSymbolId = id;

		// Carry type/default/fixed from the top-level <xsd:attribute name="..."> declaration.
		// XSD allows these only on the declaration, not the ref site, so look them up there.
		const declKey = `{${resolved.qname.namespace}}attribute:${resolved.qname.localName}`;
		const topDecl = parseResult.declarationsByQName.get(declKey)?.[0];
		if (topDecl) {
			const declAttrs = nodeAttrs(topDecl.node);
			if (declAttrs.type) {
				const declPrefixMap = parseResult.namespaceByPrefix.get(topDecl.documentPath);
				if (declPrefixMap) {
					const t = resolveQNameAttr(declAttrs.type, declPrefixMap, topDecl.namespace);
					typeRef = t.resolved ? `{${t.qname.namespace}}${t.qname.localName}` : declAttrs.type;
				} else {
					typeRef = declAttrs.type;
				}
			}
			if (defaultValue == null) defaultValue = declAttrs.default ?? null;
			if (fixedValue == null) fixedValue = declAttrs.fixed ?? null;
		}
	} else if (a.name) {
		localName = a.name;
		if (a.type) {
			const resolved = resolveQNameAttr(a.type, prefixMap, defaultNamespace);
			if (resolved.resolved) {
				typeRef = `{${resolved.qname.namespace}}${resolved.qname.localName}`;
			} else {
				typeRef = a.type; // store raw if unresolvable; never lose info
			}
		}
	}

	if (!localName) return;

	const rawUse = a.use;
	const attrUse: "required" | "optional" | "prohibited" =
		rawUse === "required" || rawUse === "optional" || rawUse === "prohibited" ? rawUse : "optional";

	await insertAttrEdge(
		sql,
		ownerSymbolId,
		attrSymbolId,
		localName,
		profileId,
		attrUse,
		defaultValue,
		fixedValue,
		typeRef,
		orderIndex,
	);
	stats.attrEdgesInserted++;
}

// --- Inheritance discovery from AST -------------------------------------

interface InheritanceFinding {
	baseQName: string;
	relation: "extension" | "restriction";
}

function findInheritance(decl: Declaration): InheritanceFinding | null {
	if (decl.kind === "complexType") {
		for (const child of nodeChildrenLocal(decl.node)) {
			const tag = stripPrefixLocal(nodeTagLocal(child));
			if (tag !== "complexContent" && tag !== "simpleContent") continue;
			for (const inner of nodeChildrenLocal(child)) {
				const innerTag = stripPrefixLocal(nodeTagLocal(inner));
				if (innerTag !== "extension" && innerTag !== "restriction") continue;
				const base = nodeAttrs(inner).base;
				if (base) return { baseQName: base, relation: innerTag };
			}
		}
		return null;
	}
	if (decl.kind === "simpleType") {
		for (const child of nodeChildrenLocal(decl.node)) {
			const tag = stripPrefixLocal(nodeTagLocal(child));
			if (tag !== "restriction") continue;
			const base = nodeAttrs(child).base;
			if (base) return { baseQName: base, relation: "restriction" };
		}
	}
	return null;
}

function nodeTagLocal(node: PreserveOrderNode): string | null {
	for (const k of Object.keys(node)) if (k !== ":@") return k;
	return null;
}
function nodeChildrenLocal(node: PreserveOrderNode): PreserveOrderNode[] {
	const tag = nodeTagLocal(node);
	if (!tag) return [];
	const v = node[tag];
	return Array.isArray(v) ? (v as PreserveOrderNode[]) : [];
}
function stripPrefixLocal(tag: string | null): string | null {
	if (!tag) return null;
	const colon = tag.indexOf(":");
	return colon < 0 ? tag : tag.slice(colon + 1);
}

function symbolKey(
	vocab: string,
	local: string,
	kind: string,
	parentId: number | null = null,
): string {
	return `${vocab}|${local}|${kind}|${parentId ?? ""}`;
}

// --- CLI -----------------------------------------------------------------

interface CliArgs {
	schemaDir: string;
	entrypoints: string[];
	profileName: string;
	sourceName: string;
}

function parseCliArgs(): CliArgs {
	const argv = process.argv.slice(2);
	let schemaDir = "./data/xsd-cache/ecma-376-transitional";
	const entrypoints: string[] = [];
	let profileName = "transitional";
	let sourceName = "ecma-376-transitional";
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--schema-dir") schemaDir = argv[++i] ?? schemaDir;
		else if (a === "--entrypoint") entrypoints.push(argv[++i] ?? "");
		else if (a === "--profile") profileName = argv[++i] ?? profileName;
		else if (a === "--source") sourceName = argv[++i] ?? sourceName;
	}
	if (entrypoints.length === 0) entrypoints.push("wml.xsd");
	return { schemaDir, entrypoints, profileName, sourceName };
}

async function main() {
	const args = parseCliArgs();
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}
	const db = createDbClient(databaseUrl);

	const t0 = Date.now();
	try {
		const stats = await ingestSchemaSet({ ...args, db });
		const ms = Date.now() - t0;
		console.log(`schemaDir:           ${args.schemaDir}`);
		console.log(`entrypoints:         ${args.entrypoints.join(", ")}`);
		console.log(`profile:             ${args.profileName}`);
		console.log(`source:              ${args.sourceName}`);
		console.log(`documents:           ${stats.documents}`);
		console.log(`symbols inserted:    ${stats.symbolsInserted}`);
		console.log(`symbols existing:    ${stats.symbolsExisting}`);
		console.log(`namespaces ensured:  ${stats.namespacesEnsured}`);
		console.log(`profile memberships: ${stats.profileMembershipsInserted}`);
		console.log(`inheritance edges:   ${stats.inheritanceEdgesInserted}`);
		console.log(`inheritance unres.:  ${stats.inheritanceUnresolved}`);
		console.log(`compositors:         ${stats.compositorsInserted}`);
		console.log(`child edges:         ${stats.childEdgesInserted}`);
		console.log(`child edges unres.:  ${stats.childEdgesUnresolved}`);
		console.log(`group refs:          ${stats.groupRefsInserted}`);
		console.log(`group refs unres.:   ${stats.groupRefsUnresolved}`);
		console.log(`local elements:      ${stats.localElementsCreated}`);
		console.log(`attr edges:          ${stats.attrEdgesInserted}`);
		console.log(`attr edges unres.:   ${stats.attrEdgesUnresolved}`);
		console.log(`attrGroup refs:      ${stats.attrGroupRefsInserted}`);
		console.log(`attrGroup refs unr.: ${stats.attrGroupRefsUnresolved}`);
		console.log(`enums:               ${stats.enumsInserted}`);
		console.log(`elapsed:             ${ms}ms`);
	} finally {
		await db.close();
	}
}

if (import.meta.path === Bun.main) {
	main().catch((err) => {
		console.error("ingest failed:", err);
		process.exit(1);
	});
}
