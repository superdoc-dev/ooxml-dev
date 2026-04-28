/**
 * Resolver tests against the existing XSD fixtures (a slim WML schema).
 * Verifies the conservative resolution path: top-level / local / ambiguous /
 * no-match / no-vocabulary outcomes.
 */

import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";
import {
	loadSymbolMap,
	resolveSymbol,
	type SymbolMap,
} from "../../scripts/ingest-ms-oi29500/resolve.ts";
import { ingestSchemaSet } from "../../scripts/ingest-ecma-376-xsds/ingest.ts";
import { getTestDatabaseUrl } from "../test-db.ts";

const FIXTURES_DIR = join(import.meta.dir, "..", "ingest-ecma-376-xsds", "fixtures");

let db: DbClient;
let map: SymbolMap;

const TRUNCATE_SQL = `
	TRUNCATE
		behavior_note_observations,
		word_observations,
		word_fixtures,
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
	db = createDbClient(getTestDatabaseUrl());
	await db.sql`
		INSERT INTO reference_sources (name, kind)
		VALUES ('ecma-376-transitional', 'xsd')
		ON CONFLICT (name) DO NOTHING
	`;
	await db.sql.unsafe(TRUNCATE_SQL);
	await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});
	map = await loadSymbolMap(db.sql);
});

afterAll(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
	await db.close();
});

test("Part 1 Section 17 top-level complexType → resolved (high, top-level)", () => {
	const out = resolveSymbol(map, "CT_Para", "17.3.1.22", 1);
	expect(out.resolved).toBe(true);
	if (out.resolved) {
		expect(out.vocabulary).toBe("wml-main");
		expect(out.symbolKind).toBe("complexType");
		expect(out.confidence).toBe("high");
		expect(out.isLocal).toBe(false);
	}
});

test("Part 1 Section 17 top-level simpleType → resolved", () => {
	const out = resolveSymbol(map, "ST_Jc", "17.18.74", 1);
	expect(out.resolved).toBe(true);
	if (out.resolved) {
		expect(out.symbolKind).toBe("simpleType");
		expect(out.isLocal).toBe(false);
	}
});

test("Part 1 Section 17 local element → resolved (isLocal=true)", () => {
	// `text` is a local element inside CT_Para in the fixture XSD.
	const out = resolveSymbol(map, "text", "17.3.1.10", 1);
	expect(out.resolved).toBe(true);
	if (out.resolved) {
		expect(out.symbolKind).toBe("element");
		expect(out.isLocal).toBe(true);
	}
});

test("Part 1 Section 17 unknown name → no-match with target_ref", () => {
	const out = resolveSymbol(map, "DoesNotExistInFixture", "17.5.5.5", 1);
	expect(out.resolved).toBe(false);
	if (!out.resolved) {
		expect(out.reason).toBe("no-match");
		expect(out.targetRef).toContain("DoesNotExistInFixture");
	}
});

test("Part 1 Section 18 (SML) → no-vocabulary (not ingested)", () => {
	const out = resolveSymbol(map, "ST_Visibility", "18.18.89", 1);
	expect(out.resolved).toBe(false);
	if (!out.resolved) {
		expect(out.reason).toBe("no-vocabulary");
	}
});

test("Part 4 short-circuits to no-vocabulary regardless of section", () => {
	const out = resolveSymbol(map, "txbxContent", "14.9.1.1", 4);
	expect(out.resolved).toBe(false);
	if (!out.resolved) {
		expect(out.reason).toBe("no-vocabulary");
	}
});

test("Section 11 (overview) → no-vocabulary", () => {
	const out = resolveSymbol(map, "WordprocessingML", "11", 1);
	expect(out.resolved).toBe(false);
});
