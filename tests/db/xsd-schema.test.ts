/**
 * Phase 2 acceptance tests: XSD schema integrity.
 *
 * Each test starts with an empty xsd_* / behavior_notes set. spec_content and
 * reference_sources are left alone. The XSD tables are empty by design in Phase 2;
 * once Phase 3 ingests data, tests should move to a separate TEST_DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun test tests/db/xsd-schema.test.ts
 */

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL for integration tests");
}

let db: DbClient;

beforeAll(() => {
	db = createDbClient(databaseUrl);
});

afterAll(async () => {
	await db.close();
});

beforeEach(async () => {
	// Wipe phase-2 tables; spec_content / reference_sources untouched.
	await db.sql`
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
});

// expect(promise).rejects.toThrow() doesn't trigger the postgres library's lazy
// query execution reliably; using an explicit try/catch instead.
async function expectThrows(fn: () => Promise<unknown>): Promise<void> {
	let threw = false;
	try {
		await fn();
	} catch {
		threw = true;
	}
	expect(threw).toBe(true);
}

test("xsd_symbols enforces canonical identity (vocabulary_id, local_name, kind)", async () => {
	await db.sql`INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'tbl', 'element')`;

	await expectThrows(
		() => db.sql`INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'tbl', 'element')`,
	);

	// Same name, different kind is allowed (an element and complexType can share names).
	await db.sql`INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'tbl', 'complexType')`;
});

test("xsd_compositors CHECK constraints", async () => {
	const [profile] = await db.sql`INSERT INTO xsd_profiles (name) VALUES ('test-profile') RETURNING id`;
	const [symbol] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'CT_Tbl', 'complexType') RETURNING id
	`;

	// Top-level: parent_symbol_id only.
	const [topLevel] = await db.sql`
		INSERT INTO xsd_compositors (parent_symbol_id, profile_id, kind)
		VALUES (${symbol.id}, ${profile.id}, 'sequence')
		RETURNING id
	`;

	// Nested: parent_compositor_id only.
	await db.sql`
		INSERT INTO xsd_compositors (parent_compositor_id, profile_id, kind)
		VALUES (${topLevel.id}, ${profile.id}, 'choice')
	`;

	// kind must be sequence/choice/all.
	await expectThrows(() => db.sql`
		INSERT INTO xsd_compositors (parent_symbol_id, profile_id, kind)
		VALUES (${symbol.id}, ${profile.id}, 'group')
	`);

	// Neither parent set is rejected.
	await expectThrows(
		() => db.sql`INSERT INTO xsd_compositors (profile_id, kind) VALUES (${profile.id}, 'sequence')`,
	);

	// Both parents set is rejected (top-level vs nested are mutually exclusive).
	await expectThrows(() => db.sql`
		INSERT INTO xsd_compositors (parent_symbol_id, parent_compositor_id, profile_id, kind)
		VALUES (${symbol.id}, ${topLevel.id}, ${profile.id}, 'sequence')
	`);
});

test("xsd_attr_edges attr_use enum and default", async () => {
	const [profile] = await db.sql`INSERT INTO xsd_profiles (name) VALUES ('test-profile') RETURNING id`;
	const [symbol] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'CT_Tbl', 'complexType') RETURNING id
	`;

	const [defaulted] = await db.sql`
		INSERT INTO xsd_attr_edges (symbol_id, local_name, profile_id)
		VALUES (${symbol.id}, 'someAttr', ${profile.id})
		RETURNING attr_use
	`;
	expect(defaulted.attr_use).toBe("optional");

	await db.sql`
		INSERT INTO xsd_attr_edges (symbol_id, local_name, profile_id, attr_use)
		VALUES (${symbol.id}, 'requiredAttr', ${profile.id}, 'required')
	`;

	await expectThrows(() => db.sql`
		INSERT INTO xsd_attr_edges (symbol_id, local_name, profile_id, attr_use)
		VALUES (${symbol.id}, 'badAttr', ${profile.id}, 'whatever')
	`);
});

test("behavior_notes claim_type enum is enforced", async () => {
	await db.sql`
		INSERT INTO behavior_notes (app, claim_type, summary)
		VALUES ('Word', 'ignores', 'test')
	`;

	await expectThrows(() => db.sql`
		INSERT INTO behavior_notes (app, claim_type, summary)
		VALUES ('Word', 'does_something', 'test')
	`);
});

test("xsd_inheritance_edges allows one base per (symbol, profile)", async () => {
	const [profile] = await db.sql`INSERT INTO xsd_profiles (name) VALUES ('test-profile') RETURNING id`;
	const [derived] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'CT_Derived', 'complexType') RETURNING id
	`;
	const [base1] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'CT_Base1', 'complexType') RETURNING id
	`;
	const [base2] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'CT_Base2', 'complexType') RETURNING id
	`;

	await db.sql`
		INSERT INTO xsd_inheritance_edges (symbol_id, base_symbol_id, profile_id, relation)
		VALUES (${derived.id}, ${base1.id}, ${profile.id}, 'extension')
	`;

	await expectThrows(() => db.sql`
		INSERT INTO xsd_inheritance_edges (symbol_id, base_symbol_id, profile_id, relation)
		VALUES (${derived.id}, ${base2.id}, ${profile.id}, 'restriction')
	`);
});

test("CASCADE delete cleans up dependent rows", async () => {
	const [profile] = await db.sql`INSERT INTO xsd_profiles (name) VALUES ('test-profile') RETURNING id`;
	const [namespace] = await db.sql`INSERT INTO xsd_namespaces (uri) VALUES ('http://example.com/test') RETURNING id`;
	const [symbol] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'w:tbl', 'element') RETURNING id
	`;

	await db.sql`
		INSERT INTO xsd_symbol_profiles (symbol_id, profile_id, namespace_id)
		VALUES (${symbol.id}, ${profile.id}, ${namespace.id})
	`;
	await db.sql`
		INSERT INTO xsd_compositors (parent_symbol_id, profile_id, kind)
		VALUES (${symbol.id}, ${profile.id}, 'sequence')
	`;

	await db.sql`DELETE FROM xsd_symbols WHERE id = ${symbol.id}`;

	const [remainingProfiles] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_symbol_profiles WHERE symbol_id = ${symbol.id}`;
	const [remainingCompositors] = await db.sql`SELECT COUNT(*)::int AS c FROM xsd_compositors WHERE parent_symbol_id = ${symbol.id}`;
	expect(remainingProfiles.c).toBe(0);
	expect(remainingCompositors.c).toBe(0);
});

test("realistic insert and lookup: 'children of w:tbl in profile transitional'", async () => {
	const [profile] = await db.sql`INSERT INTO xsd_profiles (name) VALUES ('transitional') RETURNING id`;
	const [namespace] = await db.sql`
		INSERT INTO xsd_namespaces (uri) VALUES ('http://schemas.openxmlformats.org/wordprocessingml/2006/main') RETURNING id
	`;
	const [tbl] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'tbl', 'element') RETURNING id
	`;
	const [tblPr] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'tblPr', 'element') RETURNING id
	`;
	const [tblGrid] = await db.sql`
		INSERT INTO xsd_symbols (vocabulary_id, local_name, kind) VALUES ('wml-main', 'tblGrid', 'element') RETURNING id
	`;

	await db.sql`
		INSERT INTO xsd_symbol_profiles (symbol_id, profile_id, namespace_id)
		VALUES (${tbl.id}, ${profile.id}, ${namespace.id})
	`;

	const [seq] = await db.sql`
		INSERT INTO xsd_compositors (parent_symbol_id, profile_id, kind)
		VALUES (${tbl.id}, ${profile.id}, 'sequence')
		RETURNING id
	`;

	await db.sql`
		INSERT INTO xsd_child_edges (parent_symbol_id, compositor_id, child_symbol_id, profile_id, min_occurs, max_occurs, order_index)
		VALUES
			(${tbl.id}, ${seq.id}, ${tblPr.id}, ${profile.id}, 1, 1, 0),
			(${tbl.id}, ${seq.id}, ${tblGrid.id}, ${profile.id}, 1, 1, 1)
	`;

	const children = await db.sql`
		SELECT s.local_name, e.min_occurs, e.max_occurs, e.order_index
		FROM xsd_child_edges e
		JOIN xsd_symbols s ON s.id = e.child_symbol_id
		WHERE e.parent_symbol_id = ${tbl.id} AND e.profile_id = ${profile.id}
		ORDER BY e.order_index
	`;

	expect(children).toHaveLength(2);
	expect(children[0]).toMatchObject({ local_name: "tblPr", min_occurs: 1, max_occurs: 1, order_index: 0 });
	expect(children[1]).toMatchObject({ local_name: "tblGrid", min_occurs: 1, max_occurs: 1, order_index: 1 });
});

test("xsd_namespaces and xsd_profiles have unique constraints on natural keys", async () => {
	await db.sql`INSERT INTO xsd_profiles (name) VALUES ('transitional')`;
	await expectThrows(() => db.sql`INSERT INTO xsd_profiles (name) VALUES ('transitional')`);

	await db.sql`INSERT INTO xsd_namespaces (uri) VALUES ('http://example.com/x')`;
	await expectThrows(() => db.sql`INSERT INTO xsd_namespaces (uri) VALUES ('http://example.com/x')`);
});
