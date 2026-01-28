/**
 * Text Chunking Script
 *
 * Takes extracted PDF content and creates chunks for embedding.
 * Respects section boundaries and handles XML examples specially.
 *
 * Usage:
 *   bun scripts/ingest/chunk.ts <extracted-dir> <output-file>
 *
 * Example:
 *   bun scripts/ingest/chunk.ts ./extracted/part1 ./chunks/part1-chunks.json
 */

interface ExtractedSection {
	sectionId: string;
	title: string;
	pageStart: number;
	pageEnd: number;
	content: string;
	depth: number;
	parentId: string | null;
}

interface Chunk {
	sectionId: string;
	sectionTitle: string;
	content: string;
	embeddingText: string;
	contentType: "text";
	pageNumber: number;
	chunkIndex: number;
}

// Chunking configuration
const CHUNK_SIZE = 6000; // ~2000-3000 tokens
const CHUNK_OVERLAP = 200;

// Markdown code fence pattern (pymupdf4llm outputs code in fences)
const CODE_FENCE_PATTERN = /```[\s\S]*?```/g;

// Raw XML code block pattern (fallback for non-fenced XML)
const XML_PATTERN = /<[^>]+>[\s\S]*?<\/[^>]+>/g;

// Table pattern (markdown tables with | separators)
const TABLE_PATTERN = /\|[^\n]+\|(?:\n\|[^\n]+\|)+/g;

/**
 * Strip code blocks, XML, and tables from content for embedding generation.
 * Returns text-only version suitable for semantic search embeddings.
 */
function stripForEmbedding(content: string): string {
	let text = content;

	// Strip markdown code fences
	text = text.replace(CODE_FENCE_PATTERN, " ");

	// Strip raw XML blocks
	text = text.replace(XML_PATTERN, " ");

	// Strip markdown tables
	text = text.replace(TABLE_PATTERN, " ");

	// Collapse whitespace
	return text.replace(/\n{3,}/g, "\n\n").trim();
}

function splitIntoChunks(
	text: string,
	sectionId: string,
	sectionTitle: string,
	pageStart: number,
): Chunk[] {
	const chunks: Chunk[] = [];

	if (text.trim().length === 0) {
		return chunks;
	}

	// Split full content (with code blocks and tables inline) by paragraphs
	const paragraphs = text.split(/\n\n+/);
	let currentChunk = "";
	const currentPage = pageStart;

	for (const para of paragraphs) {
		const trimmedPara = para.trim();
		if (!trimmedPara) continue;

		// Check if adding this paragraph exceeds chunk size
		if (currentChunk.length + trimmedPara.length > CHUNK_SIZE) {
			// Save current chunk if it has content
			if (currentChunk.trim()) {
				const content = currentChunk.trim();
				chunks.push({
					sectionId,
					sectionTitle,
					content,
					embeddingText: stripForEmbedding(content),
					contentType: "text",
					pageNumber: currentPage,
					chunkIndex: chunks.length,
				});
			}

			// Start new chunk with overlap
			const overlap = currentChunk.slice(-CHUNK_OVERLAP);
			currentChunk = `${overlap}\n\n${trimmedPara}`;
		} else {
			currentChunk += (currentChunk ? "\n\n" : "") + trimmedPara;
		}
	}

	// Don't forget the last chunk
	if (currentChunk.trim()) {
		const content = currentChunk.trim();
		chunks.push({
			sectionId,
			sectionTitle,
			content,
			embeddingText: stripForEmbedding(content),
			contentType: "text",
			pageNumber: currentPage,
			chunkIndex: chunks.length,
		});
	}

	return chunks;
}

async function chunkSections(sectionsPath: string): Promise<Chunk[]> {
	const sectionsJson = await Bun.file(sectionsPath).text();
	const sections: ExtractedSection[] = JSON.parse(sectionsJson);

	console.log(`Processing ${sections.length} sections...`);

	const allChunks: Chunk[] = [];

	for (const section of sections) {
		const chunks = splitIntoChunks(
			section.content,
			section.sectionId,
			section.title,
			section.pageStart,
		);
		allChunks.push(...chunks);
	}

	return allChunks;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest/chunk.ts <extracted-dir> <output-file>");
		console.log("");
		console.log("Example:");
		console.log("  bun scripts/ingest/chunk.ts ./extracted/part1 ./chunks/part1-chunks.json");
		process.exit(1);
	}

	const [extractedDir, outputFile] = args;
	const sectionsPath = `${extractedDir}/sections.json`;

	try {
		const chunks = await chunkSections(sectionsPath);

		// Save chunks
		await Bun.write(outputFile, JSON.stringify(chunks, null, 2));
		console.log(`\nSaved ${chunks.length} chunks to ${outputFile}`);

		// Print stats
		const avgContent = Math.round(
			chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length,
		);
		const avgEmbedding = Math.round(
			chunks.reduce((sum, c) => sum + c.embeddingText.length, 0) / chunks.length,
		);

		console.log("\nChunk statistics:");
		console.log(`  Total chunks: ${chunks.length}`);
		console.log(`  Average content size: ${avgContent} chars`);
		console.log(`  Average embedding text size: ${avgEmbedding} chars`);
	} catch (error) {
		console.error("Chunking failed:", error);
		process.exit(1);
	}
}

main();
