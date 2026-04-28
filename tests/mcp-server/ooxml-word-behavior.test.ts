/**
 * Tests for the dedicated `ooxml_word_behavior` tool and the verification
 * badges that surface on ooxml_implementation_notes / ooxml_element /
 * ooxml_type when a behavior_note has linked observations.
 */

import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { runOoxmlTool } from "../../apps/mcp-server/src/ooxml-tools.ts";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";
import { ingestSchemaSet } from "../../scripts/ingest-ecma-376-xsds/ingest.ts";
import { getTestDatabaseUrl } from "../test-db.ts";

const FIXTURES_DIR = join(import.meta.dir, "..", "ingest-ecma-376-xsds", "fixtures");
const databaseUrl = getTestDatabaseUrl();

let db: DbClient;
let msSourceId: number;
let confirmedNoteId: number;
let refinedNoteId: number;

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
	db = createDbClient(databaseUrl);
	await db.sql`
		INSERT INTO reference_sources (name, kind)
		VALUES ('ecma-376-transitional', 'xsd')
		ON CONFLICT (name) DO NOTHING
	`;
	await db.sql`
		INSERT INTO reference_sources (name, kind, url)
		VALUES (
			'ms-oi29500',
			'open_spec',
			'https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/1fd4a662-8623-49c0-82f0-18fa91b413b8'
		)
		ON CONFLICT (name) DO UPDATE SET url = EXCLUDED.url
	`;
	const [src] = await db.sql<Array<{ id: number }>>`
		SELECT id FROM reference_sources WHERE name = ${"ms-oi29500"}
	`;
	msSourceId = src.id;

	await db.sql.unsafe(TRUNCATE_SQL);
	await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});

	// Two seed notes: one will be confirmed, the other refined.
	const wmlNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
	const [paraSym] = await db.sql<Array<{ id: number }>>`
		SELECT s.id FROM xsd_symbols s
		JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id
		JOIN xsd_namespaces ns ON ns.id = sp.namespace_id
		WHERE s.local_name = ${"CT_Para"} AND s.kind = ${"complexType"}
		  AND s.parent_symbol_id IS NULL AND ns.uri = ${wmlNs}
	`;
	const [n1] = await db.sql<Array<{ id: number }>>`
		INSERT INTO behavior_notes (
			symbol_id, app, claim_type, summary, source_id,
			source_anchor, claim_label, claim_index, target_ref,
			standard_text, behavior_text, confidence, resolution_confidence
		) VALUES (
			${paraSym.id}, 'Word', 'writes',
			'Word emits CT_Para with extra whitespace.',
			${msSourceId},
			'guid-confirmed', 'a', 0, 'Section 17, CT_Para',
			'Spec leaves whitespace open.',
			'Word emits CT_Para with extra whitespace.', 'high', 'high'
		) RETURNING id
	`;
	const [n2] = await db.sql<Array<{ id: number }>>`
		INSERT INTO behavior_notes (
			symbol_id, app, claim_type, summary, source_id,
			source_anchor, claim_label, claim_index, target_ref,
			standard_text, behavior_text, confidence, resolution_confidence
		) VALUES (
			${paraSym.id}, 'Word', 'requires_despite_optional',
			'Word requires CT_Para val to be non-zero.',
			${msSourceId},
			'guid-refined', 'a', 0, 'Section 17, CT_Para',
			'Spec allows val=0.',
			'Word requires val to be non-zero.', 'high', 'high'
		) RETURNING id
	`;
	confirmedNoteId = n1.id;
	refinedNoteId = n2.id;

	// Two fixtures + two observations + two join rows (one confirmed, one refined).
	const [fix1] = await db.sql<Array<{ id: number }>>`
		INSERT INTO word_fixtures (name, description, sha256, generator_script, word_version)
		VALUES (
			'whitespace-test', 'CT_Para whitespace fixture', 'abc123', 'create_document(...)',
			'Word 16.0'
		) RETURNING id
	`;
	const [fix2] = await db.sql<Array<{ id: number }>>`
		INSERT INTO word_fixtures (name, description, sha256, generator_script, word_version)
		VALUES (
			'val-zero-test', 'CT_Para val=0 fixture', 'def456', 'create_document(...)',
			'Word 16.0'
		) RETURNING id
	`;
	const [o1] = await db.sql<Array<{ id: number }>>`
		INSERT INTO word_observations (fixture_id, scenario, finding, before_xml, after_xml)
		VALUES (
			${fix1.id}, 'authored',
			'Word emits CT_Para with the whitespace the doc claims.',
			NULL, '<w:p><w:r><w:t>...</w:t></w:r></w:p>'
		) RETURNING id
	`;
	const [o2] = await db.sql<Array<{ id: number }>>`
		INSERT INTO word_observations (fixture_id, scenario, finding, before_xml, after_xml)
		VALUES (
			${fix2.id}, 'open-and-save',
			'Word strips the whole CT_Para val=0 directive on save (rather than rejecting).',
			'<w:val w:val="0"/>', NULL
		) RETURNING id
	`;
	await db.sql`
		INSERT INTO behavior_note_observations (behavior_note_id, observation_id, status, notes)
		VALUES
		(${confirmedNoteId}, ${o1.id}, 'confirmed', NULL),
		(${refinedNoteId}, ${o2.id}, 'refined', 'Word does not reject; it silently drops the directive.')
	`;
});

afterAll(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
	await db.sql`DELETE FROM reference_sources WHERE name = ${"ms-oi29500"}`;
	await db.close();
});

test("ooxml_word_behavior with no filters returns all observations", async () => {
	const out = await runOoxmlTool("ooxml_word_behavior", {}, db.sql);
	expect(out).toContain("Word emits CT_Para");
	expect(out).toContain("Word strips the whole CT_Para val=0");
	expect(out).toContain("[confirmed]");
	expect(out).toContain("[refined]");
});

test("ooxml_word_behavior fixture_name filter", async () => {
	const out = await runOoxmlTool(
		"ooxml_word_behavior",
		{ fixture_name: "val-zero-test" },
		db.sql,
	);
	expect(out).toContain("val-zero-test");
	expect(out).toContain("[refined]");
	expect(out).not.toContain("whitespace-test");
});

test("ooxml_word_behavior scenario filter", async () => {
	const out = await runOoxmlTool(
		"ooxml_word_behavior",
		{ scenario: "open-and-save" },
		db.sql,
	);
	expect(out).toContain("Word strips");
	expect(out).not.toContain("Word emits CT_Para");
});

test("ooxml_word_behavior status filter", async () => {
	const out = await runOoxmlTool(
		"ooxml_word_behavior",
		{ status: "refined" },
		db.sql,
	);
	expect(out).toContain("[refined]");
	expect(out).not.toContain("[confirmed]");
});

test("ooxml_implementation_notes inlines verification status", async () => {
	const out = await runOoxmlTool(
		"ooxml_implementation_notes",
		{ source_anchor: "guid-confirmed" },
		db.sql,
	);
	expect(out).toContain("[confirmed]");
	expect(out).toContain("Word emits CT_Para");
	// observation finding should appear too
	expect(out).toContain("Word emits CT_Para with the whitespace");
});

test("ooxml_implementation_notes flags unverified rows", async () => {
	// Insert a third note with no observation.
	await db.sql`
		INSERT INTO behavior_notes (
			app, claim_type, summary, source_id,
			source_anchor, claim_label, claim_index, target_ref,
			standard_text, behavior_text, confidence
		) VALUES (
			'Word', 'varies_from_spec',
			'Untested claim.',
			${msSourceId},
			'guid-untested', 'a', 0, 'Section X, foo',
			'Spec says X.',
			'Word does Y.', 'high'
		)
	`;
	const out = await runOoxmlTool(
		"ooxml_implementation_notes",
		{ source_anchor: "guid-untested" },
		db.sql,
	);
	expect(out).toContain("[unverified]");
});
