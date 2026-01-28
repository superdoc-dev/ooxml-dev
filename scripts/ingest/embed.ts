/**
 * Embedding Generation Script
 *
 * Generates embeddings for chunks using the configured provider.
 *
 * Usage:
 *   bun scripts/ingest/embed.ts <chunks-file> <output-file>
 *
 * Environment variables:
 *   EMBEDDING_PROVIDER - openai, google, voyage, or cohere (default: openai)
 *   OPENAI_API_KEY / GOOGLE_API_KEY / etc.
 *
 * Example:
 *   EMBEDDING_PROVIDER=openai bun scripts/ingest/embed.ts ./chunks/part1-chunks.json ./embedded/part1-embedded.json
 */

import {
	createEmbeddingClient,
	type EmbeddingProvider,
} from "../../packages/shared/src/embeddings/index.ts";

interface Chunk {
	sectionId: string;
	sectionTitle: string;
	content: string;
	embeddingText?: string;
	contentType: "text";
	pageNumber: number;
	chunkIndex: number;
}

interface EmbeddedChunk extends Chunk {
	embedding: number[];
}

function getApiKey(provider: EmbeddingProvider): string {
	const keyMap: Record<EmbeddingProvider, string> = {
		openai: "OPENAI_API_KEY",
		google: "GOOGLE_API_KEY",
		voyage: "VOYAGE_API_KEY",
		cohere: "COHERE_API_KEY",
	};

	const key = process.env[keyMap[provider]];
	if (!key) {
		throw new Error(`Missing ${keyMap[provider]} environment variable`);
	}
	return key;
}

async function embedChunks(chunks: Chunk[], provider: EmbeddingProvider): Promise<EmbeddedChunk[]> {
	const apiKey = getApiKey(provider);
	const client = createEmbeddingClient(provider, { apiKey });

	console.log(`Using ${provider} (${client.model}, ${client.dimensions}d)`);
	console.log(`Embedding ${chunks.length} chunks...`);

	const embeddedChunks: EmbeddedChunk[] = [];
	const batchSize = 20; // Process 20 at a time for progress updates

	for (let i = 0; i < chunks.length; i += batchSize) {
		const batch = chunks.slice(i, i + batchSize);
		const texts = batch.map((c) => c.embeddingText ?? c.content);

		try {
			const embeddings = await client.embedBatch(texts);

			for (let j = 0; j < batch.length; j++) {
				embeddedChunks.push({
					...batch[j],
					embedding: embeddings[j],
				});
			}

			const progress = Math.min(i + batchSize, chunks.length);
			const percent = Math.round((progress / chunks.length) * 100);
			console.log(`Progress: ${progress}/${chunks.length} (${percent}%)`);

			// Small delay to avoid rate limits
			if (i + batchSize < chunks.length) {
				await new Promise((r) => setTimeout(r, 100));
			}
		} catch (error) {
			console.error(`Error embedding batch starting at ${i}:`, error);
			throw error;
		}
	}

	return embeddedChunks;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest/embed.ts <chunks-file> <output-file>");
		console.log("");
		console.log("Environment variables:");
		console.log("  EMBEDDING_PROVIDER - openai, google, voyage, or cohere (default: openai)");
		console.log("  OPENAI_API_KEY / GOOGLE_API_KEY / etc.");
		console.log("");
		console.log("Example:");
		console.log(
			"  EMBEDDING_PROVIDER=openai bun scripts/ingest/embed.ts ./chunks/part1.json ./embedded/part1.json",
		);
		process.exit(1);
	}

	const [chunksFile, outputFile] = args;
	const provider = (process.env.EMBEDDING_PROVIDER || "openai") as EmbeddingProvider;

	try {
		// Load chunks
		const chunksJson = await Bun.file(chunksFile).text();
		const chunks: Chunk[] = JSON.parse(chunksJson);
		console.log(`Loaded ${chunks.length} chunks from ${chunksFile}`);

		// Generate embeddings
		const startTime = Date.now();
		const embeddedChunks = await embedChunks(chunks, provider);
		const duration = (Date.now() - startTime) / 1000;

		// Save embedded chunks
		await Bun.write(outputFile, JSON.stringify(embeddedChunks, null, 2));
		console.log(`\nSaved ${embeddedChunks.length} embedded chunks to ${outputFile}`);
		console.log(
			`Time: ${duration.toFixed(1)}s (${(chunks.length / duration).toFixed(1)} chunks/s)`,
		);
	} catch (error) {
		console.error("Embedding failed:", error);
		process.exit(1);
	}
}

main();
