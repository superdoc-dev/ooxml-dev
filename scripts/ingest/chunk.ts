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
	contentType: "text" | "xml_example" | "table";
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

function extractCodeBlocks(content: string): {
	codeBlocks: string[];
	tables: string[];
	textContent: string;
} {
	const codeBlocks: string[] = [];
	const tables: string[] = [];
	let textContent = content;

	// Extract markdown code fences first (pymupdf4llm format)
	const fenceMatches = textContent.match(CODE_FENCE_PATTERN) || [];
	for (const match of fenceMatches) {
		if (match.length > 50) {
			codeBlocks.push(match);
			textContent = textContent.replace(match, "\n[CODE_BLOCK]\n");
		}
	}

	// Extract any remaining raw XML blocks
	const xmlMatches = textContent.match(XML_PATTERN) || [];
	for (const match of xmlMatches) {
		if (match.length > 50) {
			codeBlocks.push(match);
			textContent = textContent.replace(match, "\n[CODE_BLOCK]\n");
		}
	}

	// Extract markdown tables
	const tableMatches = textContent.match(TABLE_PATTERN) || [];
	for (const match of tableMatches) {
		if (match.length > 50) {
			tables.push(match);
			textContent = textContent.replace(match, "\n[TABLE]\n");
		}
	}

	return { codeBlocks, tables, textContent };
}

function splitIntoChunks(
	text: string,
	sectionId: string,
	sectionTitle: string,
	pageStart: number,
): Chunk[] {
	const chunks: Chunk[] = [];

	// Extract code blocks and tables first
	const { codeBlocks, tables, textContent } = extractCodeBlocks(text);

	// Add code blocks as separate chunks
	for (const code of codeBlocks) {
		chunks.push({
			sectionId,
			sectionTitle,
			content: code,
			contentType: "xml_example",
			pageNumber: pageStart,
			chunkIndex: chunks.length,
		});
	}

	// Add tables as separate chunks
	for (const table of tables) {
		chunks.push({
			sectionId,
			sectionTitle,
			content: table,
			contentType: "table",
			pageNumber: pageStart,
			chunkIndex: chunks.length,
		});
	}

	// Split remaining text into chunks
	if (textContent.trim().length === 0) {
		return chunks;
	}

	// Split by paragraphs first
	const paragraphs = textContent.split(/\n\n+/);
	let currentChunk = "";
	const currentPage = pageStart;

	for (const para of paragraphs) {
		const trimmedPara = para.trim();
		if (!trimmedPara) continue;

		// Check if adding this paragraph exceeds chunk size
		if (currentChunk.length + trimmedPara.length > CHUNK_SIZE) {
			// Save current chunk if it has content
			if (currentChunk.trim()) {
				chunks.push({
					sectionId,
					sectionTitle,
					content: currentChunk.trim(),
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
		chunks.push({
			sectionId,
			sectionTitle,
			content: currentChunk.trim(),
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
		const textChunks = chunks.filter((c) => c.contentType === "text");
		const xmlChunks = chunks.filter((c) => c.contentType === "xml_example");
		const tableChunks = chunks.filter((c) => c.contentType === "table");

		console.log("\nChunk statistics:");
		console.log(`  Text chunks: ${textChunks.length}`);
		console.log(`  XML example chunks: ${xmlChunks.length}`);
		console.log(`  Table chunks: ${tableChunks.length}`);
		console.log(
			`  Average text chunk size: ${Math.round(textChunks.reduce((sum, c) => sum + c.content.length, 0) / textChunks.length)} chars`,
		);
	} catch (error) {
		console.error("Chunking failed:", error);
		process.exit(1);
	}
}

main();
