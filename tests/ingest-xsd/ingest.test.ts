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

	// Row counts unchanged between first and second runs.
	const [c1] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_symbols`;
	const [c2] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_symbol_profiles`;
	const [c3] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_inheritance_edges`;
	expect(c1.c).toBe(first.symbolsInserted);
	// One membership per symbol per profile.
	expect(c2.c).toBe(first.profileMembershipsInserted);
	expect(c3.c).toBe(first.inheritanceEdgesInserted);
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

		// Real WML closure has 12 documents (wml + closure).
		expect(stats.documents).toBe(12);
		// At least the parser-level totals should land as symbols.
		// Real counts: 820 CT, 47 elem, 389 ST, 67 grp, 8 attrGrp, 14 attr = 1345 (+ a few xsd-builtins).
		expect(stats.symbolsInserted).toBeGreaterThan(1300);
		// Most types have an explicit base (extension or restriction); expect many edges.
		expect(stats.inheritanceEdgesInserted).toBeGreaterThan(300);
	},
);
