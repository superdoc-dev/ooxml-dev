/**
 * Phase 3c: ingest pass tests.
 *
 * Each test starts with empty xsd_* / behavior_notes tables (afterEach TRUNCATE)
 * and a known reference_sources row. Uses fixture XSDs.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ingestSchemaSet } from "../../scripts/ingest-xsd/ingest.ts";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const REAL_CACHE_DIR = "./data/xsd-cache/ecma-376-transitional";
const realCacheReady = existsSync(join(REAL_CACHE_DIR, "wml.xsd"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL for integration tests");
}

let db: DbClient;

const TRUNCATE_SQL = `
	TRUNCATE
		behavior_notes,
		xsd_enums,
		xsd_inheritance_edges,
		xsd_group_edges,
		xsd_attr_edges,
		xsd_child_edges,
		xsd_compositors,
		xsd_symbol_profiles,
		xsd_symbols,
		xsd_namespaces,
		xsd_profiles
	RESTART IDENTITY CASCADE
`;

beforeAll(async () => {
	db = createDbClient(databaseUrl);
	// Make sure ecma-376-transitional row exists; the ingest looks it up by name.
	await db.sql`
		INSERT INTO reference_sources (name, kind)
		VALUES ('ecma-376-transitional', 'xsd')
		ON CONFLICT (name) DO NOTHING
	`;
});

afterAll(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
	await db.close();
});

beforeEach(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
});

afterEach(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
});

const WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SHARED_TYPES_NS = "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes";

test("ingest writes symbols, namespaces, memberships, and the transitional profile", async () => {
	const stats = await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	expect(stats.documents).toBe(2);

	// Profile bootstrapped.
	const [profile] = await db.sql`SELECT id, name FROM xsd_profiles WHERE name = 'transitional'`;
	expect(profile?.name).toBe("transitional");

	// Both fixture target namespaces present.
	const namespaces = await db.sql`SELECT uri FROM xsd_namespaces ORDER BY uri`;
	const uris = namespaces.map((r: { uri: string }) => r.uri);
	expect(uris).toContain(WML_NS);
	expect(uris).toContain(SHARED_TYPES_NS);

	// Symbol count matches fixture: 1 element + 4 complexType + 3 simpleType +
	// 1 group + 1 attributeGroup = 10 (plus 1 xsd-builtin auto-created for restrictions).
	const [symbolCount] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_symbols`;
	expect(symbolCount.c).toBeGreaterThanOrEqual(10);

	// CT_Para is in wml-main / transitional.
	const [ctPara] = await db.sql`
		SELECT s.id, s.vocabulary_id, s.kind, sp.profile_id, sp.namespace_id
		FROM xsd_symbols s
		JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id
		WHERE s.local_name = 'CT_Para' AND s.kind = 'complexType'
	`;
	expect(ctPara?.vocabulary_id).toBe("wml-main");

	// ST_OnOff is in shared-types via the imported schema.
	const [stOnOff] = await db.sql`
		SELECT s.vocabulary_id FROM xsd_symbols s
		WHERE s.local_name = 'ST_OnOff' AND s.kind = 'simpleType'
	`;
	expect(stOnOff?.vocabulary_id).toBe("shared-types");
});

test("ingest writes inheritance edges for extension and restriction", async () => {
	const stats = await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	// Fixture inheritance:
	//   CT_Extended  extends    CT_Empty   (complexContent)
	//   CT_Restricted restricts CT_Para    (complexContent)
	//   ST_Jc        restricts  xsd:string (simpleType)
	//   ST_OnOff     restricts  xsd:boolean
	//   ST_String    restricts  xsd:string
	expect(stats.inheritanceEdgesInserted).toBe(5);
	expect(stats.inheritanceUnresolved).toBe(0);

	// Verify the CT_Extended → CT_Empty extension edge.
	const [ext] = await db.sql`
		SELECT base.local_name AS base_name, e.relation
		FROM xsd_inheritance_edges e
		JOIN xsd_symbols child ON child.id = e.symbol_id
		JOIN xsd_symbols base ON base.id = e.base_symbol_id
		WHERE child.local_name = 'CT_Extended'
	`;
	expect(ext?.base_name).toBe("CT_Empty");
	expect(ext?.relation).toBe("extension");

	// Verify CT_Restricted → CT_Para restriction.
	const [restr] = await db.sql`
		SELECT base.local_name AS base_name, e.relation
		FROM xsd_inheritance_edges e
		JOIN xsd_symbols child ON child.id = e.symbol_id
		JOIN xsd_symbols base ON base.id = e.base_symbol_id
		WHERE child.local_name = 'CT_Restricted'
	`;
	expect(restr?.base_name).toBe("CT_Para");
	expect(restr?.relation).toBe("restriction");

	// xsd-builtin placeholder symbol auto-created for the simpleType restrictions.
	const [builtin] = await db.sql`
		SELECT COUNT(*)::int AS c FROM xsd_symbols WHERE vocabulary_id = 'xsd-builtin'
	`;
	expect(builtin.c).toBeGreaterThan(0);
});

test("ingest is idempotent: re-running adds no new symbols/edges", async () => {
	const first = await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	const second = await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	expect(second.symbolsInserted).toBe(0);
	expect(second.symbolsExisting).toBeGreaterThan(0);
	expect(second.profileMembershipsInserted).toBe(0);
	expect(second.inheritanceEdgesInserted).toBe(0);
	// Content-model + attribute passes use delete-and-rewrite, so insert counts
	// equal the first run on every re-run; DB row counts stay stable.
	expect(second.compositorsInserted).toBe(first.compositorsInserted);
	expect(second.childEdgesInserted).toBe(first.childEdgesInserted);
	expect(second.groupRefsInserted).toBe(first.groupRefsInserted);
	expect(second.attrEdgesInserted).toBe(first.attrEdgesInserted);
	expect(second.attrGroupRefsInserted).toBe(first.attrGroupRefsInserted);
	expect(second.enumsInserted).toBe(first.enumsInserted);

	// Row counts unchanged between first and second runs.
	const [c1] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_symbols`;
	const [c2] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_symbol_profiles`;
	const [c3] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_inheritance_edges`;
	const [c4] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_compositors`;
	const [c5] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_child_edges`;
	const [c6] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_group_edges`;
	const [c7] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_attr_edges`;
	const [c8] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_enums`;
	expect(c1.c).toBe(first.symbolsInserted);
	expect(c2.c).toBe(first.profileMembershipsInserted);
	expect(c3.c).toBe(first.inheritanceEdgesInserted);
	expect(c4.c).toBe(first.compositorsInserted);
	expect(c5.c).toBe(first.childEdgesInserted);
	// xsd_group_edges holds both ref_kind='group' and ref_kind='attributeGroup'.
	expect(c6.c).toBe(first.groupRefsInserted + first.attrGroupRefsInserted);
	expect(c7.c).toBe(first.attrEdgesInserted);
	expect(c8.c).toBe(first.enumsInserted);
});

test("ingest writes compositors and child edges for nested content models", async () => {
	const stats = await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	// Fixture content models:
	//   CT_Para:       sequence -> element name="text"
	//   CT_Body:       sequence -> [ element ref="document",
	//                                choice (minOccurs=0, maxOccurs=unbounded) -> [
	//                                  group ref="EG_PContent",
	//                                  element name="break"
	//                                ]]
	//   EG_PContent:   choice -> element name="r"
	// Compositors total: CT_Para(1) + CT_Body(2) + EG_PContent(1) = 4
	expect(stats.compositorsInserted).toBe(4);
	expect(stats.groupRefsInserted).toBe(1);
	expect(stats.localElementsCreated).toBe(3); // text, break, r
	expect(stats.childEdgesUnresolved).toBe(0);
	expect(stats.groupRefsUnresolved).toBe(0);

	// CT_Para: one sequence with one child edge to local element "text".
	const ctParaChildren = await db.sql`
		SELECT s.local_name, e.min_occurs, e.max_occurs, e.order_index, c.kind AS compositor_kind
		FROM xsd_child_edges e
		JOIN xsd_symbols s ON s.id = e.child_symbol_id
		JOIN xsd_compositors c ON c.id = e.compositor_id
		JOIN xsd_symbols parent ON parent.id = e.parent_symbol_id
		WHERE parent.local_name = 'CT_Para' AND parent.kind = 'complexType'
		ORDER BY e.order_index
	`;
	expect(ctParaChildren).toHaveLength(1);
	expect(ctParaChildren[0]).toMatchObject({
		local_name: "text",
		min_occurs: 1,
		max_occurs: 1,
		order_index: 0,
		compositor_kind: "sequence",
	});

	// CT_Body: top sequence + nested choice. Two compositors for CT_Body.
	const ctBodyCompositors = await db.sql`
		SELECT c.kind, c.parent_symbol_id, c.parent_compositor_id, c.min_occurs, c.max_occurs, c.order_index
		FROM xsd_compositors c
		JOIN xsd_symbols s ON s.id = c.parent_symbol_id
		WHERE s.local_name = 'CT_Body' AND s.kind = 'complexType'
		ORDER BY c.order_index
	`;
	// Only the TOP-level compositor has parent_symbol_id set; nested has parent_compositor_id.
	expect(ctBodyCompositors).toHaveLength(1);
	expect(ctBodyCompositors[0]).toMatchObject({ kind: "sequence", min_occurs: 1, max_occurs: 1 });
	const topId: number = ctBodyCompositors[0].id ?? null;
	void topId;

	const nestedCompositors = await db.sql`
		SELECT c.kind, c.min_occurs, c.max_occurs, c.parent_compositor_id
		FROM xsd_compositors c
		JOIN xsd_compositors parent ON parent.id = c.parent_compositor_id
		JOIN xsd_symbols owner ON owner.id = parent.parent_symbol_id
		WHERE owner.local_name = 'CT_Body'
	`;
	expect(nestedCompositors).toHaveLength(1);
	expect(nestedCompositors[0]).toMatchObject({
		kind: "choice",
		min_occurs: 0,
		max_occurs: null, // unbounded
	});

	// CT_Body's top sequence has 1 child edge (ref="document"). The break element is
	// inside the nested choice, not the top sequence.
	const ctBodyTopChildren = await db.sql`
		SELECT s.local_name, e.order_index
		FROM xsd_child_edges e
		JOIN xsd_symbols s ON s.id = e.child_symbol_id
		JOIN xsd_compositors c ON c.id = e.compositor_id
		JOIN xsd_symbols parent ON parent.id = c.parent_symbol_id
		WHERE parent.local_name = 'CT_Body' AND c.kind = 'sequence'
		ORDER BY e.order_index
	`;
	expect(ctBodyTopChildren).toHaveLength(1);
	expect(ctBodyTopChildren[0].local_name).toBe("document");

	// CT_Body's nested choice has 1 child edge (local element "break"); the group ref
	// goes to xsd_group_edges, not child_edges.
	const ctBodyNestedChildren = await db.sql`
		SELECT s.local_name
		FROM xsd_child_edges e
		JOIN xsd_symbols s ON s.id = e.child_symbol_id
		JOIN xsd_compositors c ON c.id = e.compositor_id
		WHERE c.kind = 'choice' AND c.parent_compositor_id IS NOT NULL
	`;
	const names = ctBodyNestedChildren.map((r: { local_name: string }) => r.local_name);
	expect(names).toContain("break");

	// Group ref for EG_PContent under CT_Body.
	const groupEdges = await db.sql`
		SELECT g.local_name AS group_name, ref_kind
		FROM xsd_group_edges ge
		JOIN xsd_symbols parent ON parent.id = ge.parent_symbol_id
		JOIN xsd_symbols g ON g.id = ge.group_symbol_id
		WHERE parent.local_name = 'CT_Body'
	`;
	expect(groupEdges).toHaveLength(1);
	expect(groupEdges[0]).toMatchObject({ group_name: "EG_PContent", ref_kind: "group" });
});

test("ingest writes attributes, attributeGroup refs, and enum values", async () => {
	const stats = await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	// Fixture attributes:
	//   CT_Para/bold       (optional, type s:ST_OnOff)
	//   CT_Extended/extra  (optional, type xsd:string, under complexContent/extension)
	//   AG_TableProps/cols (optional, type xsd:int)
	//   CT_TableUser/caption (required, type xsd:string)
	expect(stats.attrEdgesInserted).toBe(4);
	expect(stats.attrEdgesUnresolved).toBe(0);

	// Fixture attributeGroup refs:
	//   CT_TableUser -> AG_TableProps
	expect(stats.attrGroupRefsInserted).toBe(1);
	expect(stats.attrGroupRefsUnresolved).toBe(0);

	// Fixture enums: ST_Jc has 3 values; ST_OnOff and ST_String have base restrictions
	// without xsd:enumeration children, so 0 enum values from those.
	expect(stats.enumsInserted).toBe(3);

	// CT_Para/bold attribute resolves to s:ST_OnOff in shared-types namespace.
	const [bold] = await db.sql`
		SELECT a.local_name, a.attr_use, a.type_ref
		FROM xsd_attr_edges a
		JOIN xsd_symbols s ON s.id = a.symbol_id
		WHERE s.local_name = 'CT_Para' AND a.local_name = 'bold'
	`;
	expect(bold?.attr_use).toBe("optional");
	expect(bold?.type_ref).toBe(
		"{http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes}ST_OnOff",
	);

	// CT_Extended/extra is on complexContent/extension.
	const [extra] = await db.sql`
		SELECT a.local_name, a.attr_use
		FROM xsd_attr_edges a
		JOIN xsd_symbols s ON s.id = a.symbol_id
		WHERE s.local_name = 'CT_Extended' AND a.local_name = 'extra'
	`;
	expect(extra?.attr_use).toBe("optional");

	// CT_TableUser/caption is required.
	const [caption] = await db.sql`
		SELECT a.local_name, a.attr_use
		FROM xsd_attr_edges a
		JOIN xsd_symbols s ON s.id = a.symbol_id
		WHERE s.local_name = 'CT_TableUser' AND a.local_name = 'caption'
	`;
	expect(caption?.attr_use).toBe("required");

	// CT_TableUser has an attributeGroup ref to AG_TableProps.
	const agRefs = await db.sql`
		SELECT g.local_name AS group_name
		FROM xsd_group_edges ge
		JOIN xsd_symbols parent ON parent.id = ge.parent_symbol_id
		JOIN xsd_symbols g ON g.id = ge.group_symbol_id
		WHERE parent.local_name = 'CT_TableUser' AND ge.ref_kind = 'attributeGroup'
	`;
	expect(agRefs).toHaveLength(1);
	expect(agRefs[0].group_name).toBe("AG_TableProps");

	// ST_Jc enum values, in declared order.
	const enumValues = await db.sql`
		SELECT e.value, e.order_index
		FROM xsd_enums e
		JOIN xsd_symbols s ON s.id = e.symbol_id
		WHERE s.local_name = 'ST_Jc' AND s.kind = 'simpleType'
		ORDER BY e.order_index
	`;
	expect(enumValues.map((r: { value: string }) => r.value)).toEqual(["left", "center", "right"]);
});

test.skipIf(!realCacheReady)(
	"smoke: ingest WML closure into the dev DB and verify counts",
	async () => {
		const stats = await ingestSchemaSet({
			schemaDir: REAL_CACHE_DIR,
			entrypoints: ["wml.xsd"],
			profileName: "transitional",
			sourceName: "ecma-376-transitional",
			db,
		});

		// Real WML closure has 12 documents.
		expect(stats.documents).toBe(12);
		expect(stats.symbolsInserted).toBeGreaterThan(1300);
		expect(stats.inheritanceEdgesInserted).toBeGreaterThan(300);
		expect(stats.compositorsInserted).toBeGreaterThan(500);
		expect(stats.childEdgesInserted).toBeGreaterThan(1000);
		expect(stats.groupRefsInserted).toBeGreaterThan(20);
		expect(stats.childEdgesUnresolved).toBe(0);
		expect(stats.groupRefsUnresolved).toBe(0);
		// Phase 3e additions:
		expect(stats.attrEdgesInserted).toBeGreaterThan(500);
		expect(stats.attrGroupRefsInserted).toBeGreaterThan(10);
		expect(stats.enumsInserted).toBeGreaterThan(200);
		// A handful of attribute refs target namespaces with no schemaLocation
		// (notably xml:space / xml:lang). They resolve to the xml namespace but
		// have no symbol because we don't load XSD's xml namespace schema.
		expect(stats.attrEdgesUnresolved).toBeLessThan(10);
		expect(stats.attrGroupRefsUnresolved).toBe(0);

		// w:tbl is the global element; its content type is CT_Tbl. Verify CT_Tbl has children.
		const ctTblChildren = await db.sql`
			SELECT s.local_name FROM xsd_child_edges e
			JOIN xsd_symbols s ON s.id = e.child_symbol_id
			JOIN xsd_symbols parent ON parent.id = e.parent_symbol_id
			WHERE parent.local_name = 'CT_Tbl' AND parent.vocabulary_id = 'wml-main'
			ORDER BY e.order_index
		`;
		expect(ctTblChildren.length).toBeGreaterThan(0);
	},
);
