/**
 * Database Upload Script
 *
 * Uploads embedded chunks to the database.
 *
 * Usage:
 *   bun scripts/ingest/upload.ts <part-number> <embedded-file>
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *
 * Example:
 *   bun scripts/ingest/upload.ts 1 ./embedded/part1-embedded.json
 */

import { createDbClient } from "../../packages/shared/src/db/index.ts";
import type { SpecContent } from "../../packages/shared/src/types/index.ts";

interface EmbeddedChunk {
	sectionId: string;
	sectionTitle: string;
	content: string;
	contentType: string;
	pageNumber: number;
	chunkIndex: number;
	embedding: number[];
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest/upload.ts <part-number> <embedded-file>");
		console.log("");
		console.log("Environment variables:");
		console.log("  DATABASE_URL - PostgreSQL connection string");
		console.log("");
		console.log("Example:");
		console.log("  bun scripts/ingest/upload.ts 1 ./embedded/part1-embedded.json");
		process.exit(1);
	}

	const [partNumberStr, embeddedFile] = args;
	const partNumber = parseInt(partNumberStr, 10);

	if (Number.isNaN(partNumber) || partNumber < 1 || partNumber > 4) {
		console.error("Part number must be 1, 2, 3, or 4");
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("Missing DATABASE_URL environment variable");
		process.exit(1);
	}

	try {
		// Load data
		const chunksJson = await Bun.file(embeddedFile).text();
		const chunks: EmbeddedChunk[] = JSON.parse(chunksJson);
		console.log(`Loaded ${chunks.length} embedded chunks`);

		// Connect to database
		console.log("Connecting to database...");
		const db = createDbClient(databaseUrl);

		// Upload in batches
		console.log("Uploading...");
		const batchSize = 50;
		let uploaded = 0;

		for (let i = 0; i < chunks.length; i += batchSize) {
			const batch = chunks.slice(i, i + batchSize);

			const items: Omit<SpecContent, "id">[] = batch.map((chunk) => ({
				partNumber,
				sectionId: chunk.sectionId,
				title: chunk.sectionTitle,
				content: chunk.content,
				contentType: chunk.contentType,
				embedding: chunk.embedding,
			}));

			await db.insertBatch(items);
			uploaded += batch.length;

			if (uploaded % 200 === 0 || uploaded === chunks.length) {
				console.log(`  ${uploaded}/${chunks.length}`);
			}
		}

		// Get stats
		const stats = await db.getStats();
		console.log(`\nDone. Total: ${stats.total}, Embedded: ${stats.embedded}`);

		await db.close();
	} catch (error) {
		console.error("Upload failed:", error);
		process.exit(1);
	}
}

main();
