/**
 * Sync reference_sources from data/sources.json.
 *
 * - Upserts each source row (matched by name + edition + version).
 * - Backfills NULL source_id on spec_content to point at the ecma-376 source.
 *   The backfill is a one-time concern; once all rows have source_id it is a no-op.
 *
 * Usage:
 *   bun scripts/sources-sync.ts
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 */

import { createDbClient } from "../packages/shared/src/db/index.ts";

interface SourceEntry {
	name: string;
	kind: string;
	edition: string | null;
	version: string | null;
	url: string | null;
	license_note: string | null;
	sha256: string | null;
}

interface Manifest {
	sources: SourceEntry[];
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("Missing DATABASE_URL environment variable");
		process.exit(1);
	}

	const manifestPath = "./data/sources.json";
	const raw = await Bun.file(manifestPath).text();
	const manifest = JSON.parse(raw) as Manifest;

	if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
		console.error(`Invalid manifest at ${manifestPath}: 'sources' must be a non-empty array`);
		process.exit(1);
	}

	console.log(`Syncing ${manifest.sources.length} source(s) from ${manifestPath}`);

	const db = createDbClient(databaseUrl);
	const sql = db.sql;

	try {
		for (const s of manifest.sources) {
			const [row] = await sql<[{ id: number; existed: boolean }]>`
				INSERT INTO reference_sources (name, kind, edition, version, url, license_note, sha256)
				VALUES (${s.name}, ${s.kind}, ${s.edition}, ${s.version}, ${s.url}, ${s.license_note}, ${s.sha256})
				ON CONFLICT (name) DO UPDATE
					SET kind = EXCLUDED.kind,
						edition = EXCLUDED.edition,
						version = EXCLUDED.version,
						url = EXCLUDED.url,
						license_note = EXCLUDED.license_note,
						sha256 = COALESCE(EXCLUDED.sha256, reference_sources.sha256)
				RETURNING id, (xmax <> 0) AS existed
			`;
			console.log(
				`  ${row.existed ? "updated " : "inserted"}  ${s.name} (id=${row.id}, edition=${s.edition ?? "null"})`,
			);
		}

		const [ecma] = await sql<[{ id: number } | undefined]>`
			SELECT id FROM reference_sources WHERE name = 'ecma-376' LIMIT 1
		`;
		if (ecma) {
			const result = await sql`
				UPDATE spec_content SET source_id = ${ecma.id} WHERE source_id IS NULL
			`;
			console.log(`Backfilled ${result.count} spec_content row(s) -> source_id=${ecma.id}`);
		} else {
			console.warn("No ecma-376 source row found; skipped spec_content backfill.");
		}
	} finally {
		await db.close();
	}
}

main().catch((err) => {
	console.error("Sync failed:", err);
	process.exit(1);
});
