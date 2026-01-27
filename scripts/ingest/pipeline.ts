/**
 * Full Ingestion Pipeline
 *
 * Runs the complete ingestion process: extract -> chunk -> embed -> upload
 *
 * Usage:
 *   bun scripts/ingest/pipeline.ts <part-number> <pdf-path>
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   EMBEDDING_PROVIDER - openai, google, voyage, or cohere (default: openai)
 *   OPENAI_API_KEY / GOOGLE_API_KEY / etc.
 *
 * Example:
 *   bun scripts/ingest/pipeline.ts 1 ./pdfs/ECMA-376-Part1.pdf
 */

import { $ } from "bun";

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest/pipeline.ts <part-number> <pdf-path>");
		console.log("");
		console.log("Environment variables:");
		console.log("  DATABASE_URL - PostgreSQL connection string");
		console.log("  EMBEDDING_PROVIDER - openai, google, voyage, or cohere (default: openai)");
		console.log("  OPENAI_API_KEY / GOOGLE_API_KEY / etc.");
		console.log("");
		console.log("Example:");
		console.log("  bun scripts/ingest/pipeline.ts 1 ./pdfs/ECMA-376-Part1.pdf");
		process.exit(1);
	}

	const [partNumberStr, pdfPath] = args;
	const partNumber = parseInt(partNumberStr, 10);

	if (Number.isNaN(partNumber) || partNumber < 1 || partNumber > 4) {
		console.error("Part number must be 1, 2, 3, or 4");
		process.exit(1);
	}

	// Check environment
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL environment variable");
		process.exit(1);
	}

	const provider = process.env.EMBEDDING_PROVIDER || "openai";
	const apiKeyVar = {
		openai: "OPENAI_API_KEY",
		google: "GOOGLE_API_KEY",
		voyage: "VOYAGE_API_KEY",
		cohere: "COHERE_API_KEY",
	}[provider];

	if (apiKeyVar && !process.env[apiKeyVar]) {
		console.error(`Missing ${apiKeyVar} environment variable`);
		process.exit(1);
	}

	// Create directories
	const extractedDir = `./data/extracted/part${partNumber}`;
	const chunksFile = `./data/chunks/part${partNumber}-chunks.json`;
	const embeddedFile = `./data/embedded/part${partNumber}-embedded.json`;

	await $`mkdir -p ./data/extracted ./data/chunks ./data/embedded`;

	console.log("=".repeat(60));
	console.log(`ECMA-376 Part ${partNumber} Ingestion Pipeline`);
	console.log("=".repeat(60));
	console.log(`PDF: ${pdfPath}`);
	console.log(`Embedding provider: ${provider}`);
	console.log("");

	// Step 1: Extract (using Python + pymupdf4llm for better markdown output)
	console.log("\n[1/4] Extracting PDF...");
	console.log("-".repeat(40));

	// Try different Python paths (pymupdf4llm may be installed in a specific version)
	const pythonPaths = [
		process.env.PYTHON_PATH,
		"/opt/homebrew/bin/python3.10",
		"/opt/homebrew/bin/python3",
		"python3",
		"python",
	].filter(Boolean);

	let extractSuccess = false;
	for (const pythonPath of pythonPaths) {
		try {
			await $`${pythonPath} -c "import pymupdf4llm" 2>/dev/null`;
			console.log(`Using Python: ${pythonPath}`);
			await $`${pythonPath} scripts/ingest/extract-pdf.py ${pdfPath} ${extractedDir}`;
			extractSuccess = true;
			break;
		} catch {
			// Try next Python path
		}
	}

	if (!extractSuccess) {
		console.error("Failed to find Python with pymupdf4llm installed.");
		console.error("Install with: pip install -r scripts/requirements.txt");
		console.error("Or set PYTHON_PATH environment variable.");
		process.exit(1);
	}

	// Step 2: Chunk
	console.log("\n[2/4] Chunking content...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest/chunk.ts ${extractedDir} ${chunksFile}`;

	// Step 3: Embed
	console.log("\n[3/4] Generating embeddings...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest/embed.ts ${chunksFile} ${embeddedFile}`;

	// Step 4: Upload
	console.log("\n[4/4] Uploading to database...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest/upload.ts ${partNumber} ${embeddedFile}`;

	console.log(`\n${"=".repeat(60)}`);
	console.log("Pipeline complete!");
	console.log("=".repeat(60));
}

main().catch((error) => {
	console.error("Pipeline failed:", error);
	process.exit(1);
});
