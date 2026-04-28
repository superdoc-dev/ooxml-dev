/**
 * Seed the verification layer with the 4 observations recorded during Phase
 * 4 dogfooding (the Arabic-bold test, the cols/num test, the trHeight val=0
 * test, and the style-rPr test). Each observation links to the relevant
 * MS-OI29500 note(s) by source_anchor.
 *
 * Re-running is idempotent: fixtures upsert on `name`; observations and
 * join rows are skipped when their (fixture, scenario) / (note, observation)
 * pair already exists.
 *
 * Usage:
 *   DATABASE_URL=... bun scripts/seed-word-observations.ts
 */

import type { Sql } from "postgres";
import { createDbClient } from "../packages/shared/src/db/index.ts";

interface FixtureSpec {
	name: string;
	description: string;
	sha256: string;
	generatorScript: string;
	wordVersion: string;
}

interface ObservationSpec {
	fixtureName: string;
	scenario: string;
	finding: string;
	beforeXml: string | null;
	afterXml: string | null;
	links: Array<{
		sourceAnchor: string;
		/** Letter of the specific sub-claim on the page (a, b, c, ...). MS-OI29500
		 *  pages can have multiple claim groups; without this, a link defaults to
		 *  claim 'a' and may end up tagging the wrong sub-claim. */
		claimLabel: string;
		status: "confirmed" | "refined" | "contradicted" | "not_reproducible";
		notes: string | null;
	}>;
}

const FIXTURES: FixtureSpec[] = [
	{
		name: "arabic-bold-test",
		description:
			"One paragraph with bold English and bold Arabic runs side by side. Used to inspect whether Word emits w:b or w:bCs for cs/rtl runs.",
		sha256: "5acf5e29f847afe964e805dd5b5138cde4963a22e501e84b787018eb68bb078f",
		generatorScript:
			'mcp__word-api__create_document(content=[heading, paragraph with runs: bold English + bold Arabic "النص العربي"])',
		wordVersion: "Word 16.0",
	},
	{
		name: "cols-test",
		description:
			"Three unequal-width columns after a continuous section break. Used to check Word's `<w:cols>` num attribute behavior.",
		sha256: "732f3b7691525d0ff4bd7f80bcb7709447e39ff2d50ca3752a22ba6e9845404b",
		generatorScript:
			"mcp__word-api__create_document(content=[paragraph, section_break continuous, columns count=3 equal_width=false widths=[2.5, 1.8, 1.2]])",
		wordVersion: "Word 16.0",
	},
	{
		name: "rowheight-val-zero",
		description:
			'Hand-authored DOCX with <w:trHeight w:val="0" w:hRule="exact"/> opened and saved by Word, to observe Word\'s repair behavior.',
		sha256: "b82336766dd86d25b1d2ba6220f04d511ed903cc017c3d3d3eb2507c0d15632a",
		generatorScript:
			'PowerShell: author 1x1 table with Row.Height=24 / HeightRule=2, then patch document.xml to val="0", reopen and SaveAs2.',
		wordVersion: "Word 16.0",
	},
	{
		name: "style-rpr-test",
		description:
			"Document containing built-in Heading 1, Heading 2, Quote styles plus an inline-formatted paragraph. Used to inspect every styles.xml rPr block for disallowed children.",
		sha256: "2c6b384a3a1f8ed695db23747a9d78ea26197555657723a3df1fdd1d4d22ff4a",
		generatorScript:
			"mcp__word-api__create_document(content=[heading L1, heading L2, paragraph style=Quote, paragraph with runs])",
		wordVersion: "Word 16.0",
	},
];

const OBSERVATIONS: ObservationSpec[] = [
	{
		fixtureName: "arabic-bold-test",
		scenario: "authored",
		finding:
			"Word emits <w:b/> on every bold run including the cs/rtl Arabic runs. It does NOT emit <w:bCs/>. Word reads <w:b/> and renders Arabic bold from this file.",
		beforeXml: null,
		afterXml: '<w:r><w:rPr><w:rFonts w:hint="cs"/><w:b/><w:rtl/></w:rPr><w:t>النص</w:t></w:r>',
		// MS-OI29500 §17.3.2.1, sub-claim a (the only claim on the b/bold page).
		links: [
			{
				sourceAnchor: "03b9695f-fd69-435d-90e6-b1069aadf291",
				claimLabel: "a",
				status: "contradicted",
				notes:
					"Note describes a read rule (w:b applies only to non-cs/non-rtl runs) but Word's actual read+write paths apply w:b to cs/rtl runs too. Implementers should not gate complex-script bold on w:bCs alone.",
			},
		],
	},
	{
		fixtureName: "cols-test",
		scenario: "authored",
		finding:
			'Word writes <w:cols w:num="3" w:space="288" w:equalWidth="0"> with 3 <w:col> children, even though the spec says num is ignored when equalWidth=false. Confirms the documented requirement.',
		beforeXml: null,
		afterXml:
			'<w:cols w:num="3" w:space="288" w:equalWidth="0"><w:col w:w="3600" w:space="432"/><w:col w:w="2592" w:space="432"/><w:col w:w="1728" w:space="720"/></w:cols>',
		// MS-OI29500 §17.6.4 (cols), sub-claim c: "Word requires that the value
		// of the num attribute matches the number of child col elements."
		links: [
			{
				sourceAnchor: "ef7027d4-e05d-473b-8777-dcc2aee91935",
				claimLabel: "c",
				status: "confirmed",
				notes: null,
			},
		],
	},
	{
		fixtureName: "rowheight-val-zero",
		scenario: "open-and-save",
		finding:
			'Word strips the entire <w:trHeight> element (and the now-empty <w:trPr> parent) on save. The doc says Word "requires val != 0"; Word\'s actual repair path is to drop the directive entirely rather than reject the file or coerce val to a positive number.',
		beforeXml: '<w:trPr><w:trHeight w:hRule="exact" w:val="0"/></w:trPr>',
		afterXml: "(no <w:trPr> on the row)",
		// MS-OI29500 §17.4.80 (trHeight), sub-claim c: "Word requires that if
		// the hRule attribute is set to exact, then the val attribute must not
		// be 0." (Sub-claim a covers the hRule-omitted default; sub-claim b
		// covers the val datatype.)
		links: [
			{
				sourceAnchor: "5919e0bd-e6ce-477e-8d66-0e5282f5c506",
				claimLabel: "c",
				status: "refined",
				notes:
					"Direction is correct (Word doesn't keep val=0 with hRule=exact) but Word's enforcement is silent removal, not validation failure. SuperDoc parsers should expect the trHeight to disappear during a Word round-trip.",
			},
		],
	},
	{
		fixtureName: "style-rpr-test",
		scenario: "authored",
		finding:
			"Across 28 <w:rPr> blocks under <w:style> in styles.xml, Word emits zero of the disallowed children (cs, highlight, oMath, rPrChange, rStyle, rtl). Confirms the documented restriction.",
		beforeXml: null,
		afterXml: "(no disallowed children in any of 28 inspected style rPr blocks)",
		// MS-OI29500 §17.7.6.2 (rPr children in style definitions), single claim a.
		links: [
			{
				sourceAnchor: "d0244b61-fd96-45f0-ac84-7380d2b6d663",
				claimLabel: "a",
				status: "confirmed",
				notes: null,
			},
		],
	},
];

async function upsertFixture(sql: Sql, f: FixtureSpec): Promise<number> {
	const [row] = await sql<Array<{ id: number }>>`
		INSERT INTO word_fixtures (name, description, sha256, generator_script, word_version)
		VALUES (${f.name}, ${f.description}, ${f.sha256}, ${f.generatorScript}, ${f.wordVersion})
		ON CONFLICT (name) DO UPDATE SET
			description = EXCLUDED.description,
			sha256 = EXCLUDED.sha256,
			generator_script = EXCLUDED.generator_script,
			word_version = EXCLUDED.word_version
		RETURNING id
	`;
	return row.id;
}

async function findOrInsertObservation(
	sql: Sql,
	fixtureId: number,
	o: ObservationSpec,
): Promise<number> {
	const existing = await sql<Array<{ id: number }>>`
		SELECT id FROM word_observations
		WHERE fixture_id = ${fixtureId} AND scenario = ${o.scenario} AND finding = ${o.finding}
		LIMIT 1
	`;
	if (existing.length > 0) return existing[0].id;
	const [row] = await sql<Array<{ id: number }>>`
		INSERT INTO word_observations (fixture_id, scenario, finding, before_xml, after_xml)
		VALUES (${fixtureId}, ${o.scenario}, ${o.finding}, ${o.beforeXml}, ${o.afterXml})
		RETURNING id
	`;
	return row.id;
}

async function findNoteId(
	sql: Sql,
	sourceAnchor: string,
	claimLabel: string,
): Promise<number | null> {
	const rows = await sql<Array<{ id: number }>>`
		SELECT id FROM behavior_notes
		WHERE source_anchor = ${sourceAnchor}
		  AND claim_label = ${claimLabel}
		ORDER BY claim_index
		LIMIT 1
	`;
	return rows.length > 0 ? rows[0].id : null;
}

async function linkNoteObservation(
	sql: Sql,
	noteId: number,
	observationId: number,
	status: string,
	notes: string | null,
): Promise<void> {
	await sql`
		INSERT INTO behavior_note_observations (behavior_note_id, observation_id, status, notes)
		VALUES (${noteId}, ${observationId}, ${status}, ${notes})
		ON CONFLICT (behavior_note_id, observation_id) DO UPDATE SET
			status = EXCLUDED.status,
			notes = EXCLUDED.notes
	`;
}

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("Set DATABASE_URL");
	const db = createDbClient(url);

	console.log(`Seeding ${FIXTURES.length} fixtures + ${OBSERVATIONS.length} observations...`);

	const fixtureIds = new Map<string, number>();
	for (const f of FIXTURES) {
		const id = await upsertFixture(db.sql, f);
		fixtureIds.set(f.name, id);
		console.log(`  fixture ${f.name} → id=${id}`);
	}

	let linksCreated = 0;
	let linksSkipped = 0;
	for (const o of OBSERVATIONS) {
		const fixtureId = fixtureIds.get(o.fixtureName);
		if (!fixtureId) throw new Error(`Unknown fixture ${o.fixtureName}`);
		const obsId = await findOrInsertObservation(db.sql, fixtureId, o);
		console.log(`  observation [${o.fixtureName}/${o.scenario}] → id=${obsId}`);
		// Remove any prior links for this observation so a re-seed with corrected
		// claimLabels doesn't leave stale join rows pointing at the wrong claim.
		await db.sql`DELETE FROM behavior_note_observations WHERE observation_id = ${obsId}`;

		for (const link of o.links) {
			const noteId = await findNoteId(db.sql, link.sourceAnchor, link.claimLabel);
			if (noteId === null) {
				console.log(
					`    SKIP link: no behavior_note for source_anchor=${link.sourceAnchor} claim=${link.claimLabel}`,
				);
				linksSkipped++;
				continue;
			}
			await linkNoteObservation(db.sql, noteId, obsId, link.status, link.notes);
			console.log(`    link → note=${noteId} (${link.claimLabel}) status=${link.status}`);
			linksCreated++;
		}
	}

	console.log(`\nDone. Links created/updated: ${linksCreated}, skipped: ${linksSkipped}.`);
	await db.close();
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
