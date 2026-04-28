/**
 * Tests for the dedicated `ooxml_behavior` tool and the inline behavior-note
 * surface on `ooxml_element` / `ooxml_type`.
 *
 * Setup mirrors ooxml-queries.test.ts: ingest the same fixture XSDs into a
 * truncated test DB, then seed a small set of behavior_notes rows with known
 * shape so we can assert filtering behavior and citation formatting.
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

	// Seed behavior_notes. The fixture has top-level CT_Para and ST_Jc, plus
	// a local element `text` inside CT_Para. We insert one note per anchor
	// pointing at each, plus a target_ref-only note to test the qname
	// word-boundary fallback.
	const wmlNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
	const [paraSym] = await db.sql<Array<{ id: number }>>`
		SELECT s.id FROM xsd_symbols s
		JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id
		JOIN xsd_namespaces ns ON ns.id = sp.namespace_id
		WHERE s.local_name = ${"CT_Para"} AND s.kind = ${"complexType"}
		  AND s.parent_symbol_id IS NULL AND ns.uri = ${wmlNs}
	`;
	const [textLocal] = await db.sql<Array<{ id: number }>>`
		SELECT s.id FROM xsd_symbols s
		WHERE s.local_name = ${"text"} AND s.kind = ${"element"}
		  AND s.parent_symbol_id IS NOT NULL
	`;

	await db.sql`
		INSERT INTO behavior_notes (
			symbol_id, app, claim_type, summary, source_id, section_id,
			source_anchor, claim_label, claim_index, target_ref,
			standard_text, behavior_text, confidence, resolution_confidence
		)
		VALUES
		(${paraSym.id}, 'Word', 'writes',
		 'Word emits CT_Para with extra whitespace.',
		 ${msSourceId}, '17.3.1.22 (Part 1 §17.3.1.22)',
		 'guid-para', 'a', 0, NULL,
		 'The standard says CT_Para is paragraph metadata.',
		 'Word emits CT_Para with extra whitespace.', 'high', 'high'),
		(${textLocal.id}, 'Word', 'does_not_support',
		 'Word does not support nested text runs in CT_Para.',
		 ${msSourceId}, '17.3.1.22 (Part 1 §17.3.1.22)',
		 'guid-text-local', 'a', 0, NULL,
		 'The standard allows nested text runs.',
		 'Word does not support nested text runs in CT_Para.', 'high', 'high'),
		(NULL, 'Word', 'varies_from_spec',
		 'Word handles tbl differently.',
		 ${msSourceId}, '17.4.37 (Part 1 §17.4.37)',
		 'guid-tbl-unresolved', 'a', 0,
		 'Section 17.4.37, tbl',
		 'Spec says tbl renders inline.',
		 'Word handles tbl differently.', 'high', 'low'),
		(NULL, 'Word', 'varies_from_spec',
		 'Word handles tblPr differently.',
		 ${msSourceId}, '17.4.59 (Part 1 §17.4.59)',
		 'guid-tblpr-unresolved', 'a', 0,
		 'Section 17.4.59, tblPr',
		 'Spec says tblPr is table-level metadata.',
		 'Word handles tblPr differently.', 'high', 'low'),
		(NULL, 'Excel', 'does_not_support',
		 'Excel does not support textBox in this context.',
		 ${msSourceId}, '18.5.1.5',
		 'guid-textbox-unresolved', 'a', 0,
		 'Section 18.5.1.5, textBox',
		 'Spec says textBox is allowed.',
		 'Excel does not support textBox in this context.', 'high', 'low')
	`;
});

afterAll(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
	await db.sql`DELETE FROM reference_sources WHERE name = ${"ms-oi29500"}`;
	await db.close();
});

test("ooxml_behavior with no filters returns the missing-filter error", async () => {
	const out = await runOoxmlTool("ooxml_behavior", {}, db.sql);
	expect(out).toContain("Missing filter");
	expect(out).toContain("section_id");
	// Must NOT include the schema-tool fallback hint that's irrelevant here.
	expect(out).not.toContain("known prefix qname");
});

test("ooxml_behavior qname=tbl matches target_ref but excludes textBox / tblPr", async () => {
	const out = await runOoxmlTool("ooxml_behavior", { qname: "w:tbl" }, db.sql);
	// The 'tbl' unresolved note should match (target_ref = "Section 17.4.37, tbl").
	expect(out).toContain("Word handles tbl differently");
	// But NOT the tblPr or textBox notes - word-boundary regex prevents the
	// substring false positive.
	expect(out).not.toContain("Word handles tblPr differently");
	expect(out).not.toContain("Excel does not support textBox");
});

test("ooxml_behavior qname=textBox doesn't pull tbl-related notes", async () => {
	const out = await runOoxmlTool("ooxml_behavior", { qname: "w:textBox" }, db.sql);
	expect(out).not.toContain("Word handles tbl differently");
	expect(out).not.toContain("Word handles tblPr differently");
});

test("ooxml_behavior qname=text picks up the local-symbol note", async () => {
	const out = await runOoxmlTool("ooxml_behavior", { qname: "w:text" }, db.sql);
	expect(out).toContain("Word does not support nested text runs");
	// Must not also pull the unrelated tbl/textBox/tblPr unresolved notes.
	expect(out).not.toContain("Word handles tbl differently");
});

test("ooxml_behavior section_id substring matches", async () => {
	const out = await runOoxmlTool("ooxml_behavior", { section_id: "17.3.1.22" }, db.sql);
	expect(out).toContain("Word emits CT_Para");
	expect(out).toContain("Word does not support nested text runs");
});

test("ooxml_behavior source_anchor exact match", async () => {
	const out = await runOoxmlTool(
		"ooxml_behavior",
		{ source_anchor: "guid-para" },
		db.sql,
	);
	expect(out).toContain("Word emits CT_Para");
	expect(out).not.toContain("Word does not support nested text runs");
});

test("ooxml_behavior app filter is exact", async () => {
	const excelOnly = await runOoxmlTool("ooxml_behavior", { app: "Excel" }, db.sql);
	expect(excelOnly).toContain("Excel does not support textBox");
	expect(excelOnly).not.toContain("Word emits CT_Para");
});

test("ooxml_behavior claim_type filter is exact", async () => {
	const out = await runOoxmlTool("ooxml_behavior", { claim_type: "writes" }, db.sql);
	expect(out).toContain("Word emits CT_Para");
	expect(out).not.toContain("Word does not support nested text runs");
});

test("ooxml_behavior renders a working per-note URL (not the broken landing-guid form)", async () => {
	const out = await runOoxmlTool("ooxml_behavior", { source_anchor: "guid-para" }, db.sql);
	expect(out).toContain(
		"https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/guid-para",
	);
	// Must not also stitch the landing-page GUID into the path.
	expect(out).not.toContain("1fd4a662-8623-49c0-82f0-18fa91b413b8/guid-para");
});

test("ooxml_type w:ST_Jc inlines a behavior note when one is attached", async () => {
	// Add an inline-targeted note for ST_Jc and verify it shows up on ooxml_type.
	const wmlNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
	const [stJc] = await db.sql<Array<{ id: number }>>`
		SELECT s.id FROM xsd_symbols s
		JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id
		JOIN xsd_namespaces ns ON ns.id = sp.namespace_id
		WHERE s.local_name = ${"ST_Jc"} AND s.kind = ${"simpleType"}
		  AND s.parent_symbol_id IS NULL AND ns.uri = ${wmlNs}
	`;
	await db.sql`
		INSERT INTO behavior_notes (
			symbol_id, app, claim_type, summary, source_id, section_id,
			source_anchor, claim_label, claim_index, standard_text, behavior_text,
			confidence, resolution_confidence
		)
		VALUES (
			${stJc.id}, 'Word', 'varies_from_spec',
			'Word renders both differently from the spec.',
			${msSourceId}, '17.18.44',
			'guid-st-jc', 'a', 0,
			'Spec specifies both as a justification value.',
			'Word renders both differently from the spec.',
			'high', 'high'
		)
	`;
	const out = await runOoxmlTool("ooxml_type", { qname: "w:ST_Jc" }, db.sql);
	expect(out).toContain("SimpleType: ST_Jc");
	expect(out).toContain("Behavior notes (1)");
	expect(out).toContain("Word renders both differently");
	expect(out).toContain(
		"https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/guid-st-jc",
	);
});
