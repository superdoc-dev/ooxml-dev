/**
 * Apply migrations in order from db/migrations/*.sql against $DATABASE_URL.
 * All migrations are idempotent; re-running is safe.
 *
 * Usage:
 *   bun scripts/db-migrate.ts
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createDbClient } from "../packages/shared/src/db/index.ts";

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("Missing DATABASE_URL environment variable");
		process.exit(1);
	}

	const dir = "./db/migrations";
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort();

	if (files.length === 0) {
		console.log("No migrations found.");
		return;
	}

	const db = createDbClient(databaseUrl);
	try {
		for (const f of files) {
			const content = await Bun.file(join(dir, f)).text();
			console.log(`Applying ${f}...`);
			await db.sql.unsafe(content);
		}
		console.log(`Applied ${files.length} migration(s).`);
	} finally {
		await db.close();
	}
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
