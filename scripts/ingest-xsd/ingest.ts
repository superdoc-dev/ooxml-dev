/**
 * Phase 3c: ingest top-level symbols and inheritance edges.
 *
 * Walks parseSchemaSet output and writes:
 *   - xsd_profiles      (bootstrap target profile, idempotent)
 *   - xsd_namespaces    (one row per unique URI seen across documents)
 *   - xsd_symbols       (canonical (vocabulary_id, local_name, kind), upsert by natural key)
 *   - xsd_symbol_profiles (membership for the target profile, with source_id)
 *   - xsd_inheritance_edges (extension/restriction from complexContent/simpleContent
 *     and simpleType/restriction)
 *
 * NOT touched here (Phases 3d/3e):
 *   - xsd_compositors, xsd_child_edges (content models)
 *   - xsd_attr_edges (attributes)
 *   - xsd_group_edges (group/attributeGroup refs)
 *   - xsd_enums (simpleType enumerations)
 *
 * Idempotency: the entire ingest runs in a single transaction. Re-running
 * against the same source produces no new rows (UNIQUE + ON CONFLICT DO NOTHING).
 * Stale-row cleanup (when symbols vanish in a future edition) is deferred,
 * see PLAN.md "Edition flip and behavior_notes" open item.
 *
 * Usage as a library:
 *   await ingestSchemaSet({ schemaDir, entrypoints, profileName, sourceName, sql })
 *
 * Usage as a CLI:
 *   bun scripts/ingest-xsd/ingest.ts
 *   bun scripts/ingest-xsd/ingest.ts --schema-dir <dir> --entrypoint wml.xsd \
 *                                    --profile transitional --source ecma-376-transitional
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
	};

	await opts.db.sql.begin(async (sql: Sql) => {
		const profileId = await ensureProfile(sql, opts.profileName);
		const sourceId = await lookupSourceId(sql, opts.sourceName);

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
				const { id, inserted } = await upsertSymbol(
					sql,
					decl.vocabularyId,
					decl.localName,
					decl.kind,
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
					ownerSymbolId,
					ownerDecl: decl,
					prefixMap,
					symbolIds,
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
							await handleGroupRef(child, topOrder, ctx);
							topOrder++;
						}
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
	ownerSymbolId: number;
	ownerDecl: Declaration;
	prefixMap: Map<string, string>;
	symbolIds: Map<string, number>;
	stats: IngestStats;
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
			await handleGroupRef(child, childOrder, ctx, compositorId);
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
		const key = symbolKey(ctx.ownerDecl.vocabularyId, a.name, "element");
		let id = ctx.symbolIds.get(key);
		if (id == null) {
			const res = await upsertSymbol(ctx.sql, ctx.ownerDecl.vocabularyId, a.name, "element");
			ctx.symbolIds.set(key, res.id);
			if (res.inserted) {
				ctx.stats.symbolsInserted++;
				ctx.stats.localElementsCreated++;
			} else {
				ctx.stats.symbolsExisting++;
			}
			id = res.id;
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
	orderIndex: number,
	ctx: WalkCtx,
	_compositorId: number | null = null,
): Promise<void> {
	void _compositorId; // group_edges aren't compositor-scoped in our schema; refs hang off the parent symbol.
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
		groupSymbolId,
		ctx.profileId,
		"group",
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
			`reference_sources row not found for name='${name}'. Run db:sync-sources first.`,
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
): Promise<{ id: number; inserted: boolean }> {
	const [row] = await sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind)
		VALUES (${vocabularyId}, ${localName}, ${kind})
		ON CONFLICT (vocabulary_id, local_name, kind) DO UPDATE SET kind = EXCLUDED.kind
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
	groupSymbolId: number,
	profileId: number,
	refKind: "group" | "attributeGroup",
	orderIndex: number,
): Promise<void> {
	await sql`
		INSERT INTO xsd_group_edges
			(parent_symbol_id, group_symbol_id, profile_id, ref_kind, order_index)
		VALUES
			(${parentSymbolId}, ${groupSymbolId}, ${profileId}, ${refKind}, ${orderIndex})
	`;
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

function symbolKey(vocab: string, local: string, kind: string): string {
	return `${vocab}|${local}|${kind}`;
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
