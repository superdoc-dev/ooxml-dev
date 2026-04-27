/**
 * Fetch ECMA-376 Transitional XSDs from the ECMA Part 4 zip.
 *
 * The Part 4 zip is published by Ecma International on the ECMA-376
 * publications page. It contains OfficeOpenXML-XMLSchema-Transitional.zip,
 * which in turn contains the 26 Transitional XSDs (wml.xsd, dml-main.xsd,
 * sml.xsd, pml.xsd, shared-*.xsd, and friends).
 *
 * Cache layout:
 *   data/xsd-cache/
 *     _staging/                         (outer + inner zip extraction scratch)
 *     ecma-376-transitional/            (final XSDs land here)
 *
 * Usage:
 *   bun scripts/ingest-xsd/fetch.ts --url <part4-zip-url>
 *   bun scripts/ingest-xsd/fetch.ts --url <url> --expected-sha256 <hex>
 *
 * Or via env:
 *   XSD_PART4_URL=<url> bun scripts/ingest-xsd/fetch.ts
 *
 * After a successful fetch the script prints the outer-zip sha256;
 * paste it into data/sources.json under the ecma-376-transitional entry
 * to pin reproducibility.
 */

import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const CACHE_ROOT = "./data/xsd-cache";
const STAGING_DIR = join(CACHE_ROOT, "_staging");
const FINAL_DIR = join(CACHE_ROOT, "ecma-376-transitional");
const DEFAULT_INNER_ZIP = "OfficeOpenXML-XMLSchema-Transitional.zip";

interface Args {
	url: string;
	expectedSha256: string | null;
	innerZip: string;
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	let url = process.env.XSD_PART4_URL ?? "";
	let expectedSha256: string | null = null;
	let innerZip = DEFAULT_INNER_ZIP;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--url") url = argv[++i] ?? "";
		else if (a === "--expected-sha256") expectedSha256 = argv[++i] ?? null;
		else if (a === "--inner-zip") innerZip = argv[++i] ?? DEFAULT_INNER_ZIP;
	}

	if (!url) {
		console.error("Missing --url (or XSD_PART4_URL env var).");
		console.error("Pass the canonical ECMA-376 5th edition Part 4 zip URL.");
		process.exit(1);
	}
	return { url, expectedSha256, innerZip };
}

async function sha256(path: string): Promise<string> {
	const buf = await Bun.file(path).arrayBuffer();
	return createHash("sha256").update(new Uint8Array(buf)).digest("hex");
}

async function downloadTo(url: string, dest: string): Promise<void> {
	console.log(`Downloading ${url}`);
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
	}
	const buf = await res.arrayBuffer();
	await Bun.write(dest, buf);
	console.log(`  wrote ${dest} (${(buf.byteLength / 1024 / 1024).toFixed(2)} MiB)`);
}

async function unzipInto(zipPath: string, dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	const proc = Bun.spawn(["unzip", "-o", "-q", zipPath, "-d", dir], {
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	if (code !== 0) throw new Error(`unzip exited ${code} on ${zipPath}`);
}

function findFile(dir: string, name: string): string | null {
	const stack = [dir];
	while (stack.length) {
		const cur = stack.pop()!;
		for (const entry of readdirSync(cur, { withFileTypes: true })) {
			const p = join(cur, entry.name);
			if (entry.isDirectory()) stack.push(p);
			else if (entry.name === name) return p;
		}
	}
	return null;
}

async function main() {
	const args = parseArgs();

	await rm(STAGING_DIR, { recursive: true, force: true });
	await rm(FINAL_DIR, { recursive: true, force: true });
	await mkdir(STAGING_DIR, { recursive: true });

	const outerPath = join(STAGING_DIR, "part4.zip");
	await downloadTo(args.url, outerPath);

	const outerHash = await sha256(outerPath);
	console.log(`outer zip sha256: ${outerHash}`);
	if (args.expectedSha256 && outerHash !== args.expectedSha256) {
		throw new Error(`sha256 mismatch: expected ${args.expectedSha256}, got ${outerHash}`);
	}

	console.log(`Extracting outer zip into ${STAGING_DIR}`);
	await unzipInto(outerPath, STAGING_DIR);

	const innerPath = findFile(STAGING_DIR, args.innerZip);
	if (!innerPath) {
		throw new Error(`Did not find ${args.innerZip} inside the outer zip.`);
	}
	console.log(`Found inner zip at ${innerPath}`);

	console.log(`Extracting Transitional XSDs into ${FINAL_DIR}`);
	await unzipInto(innerPath, FINAL_DIR);

	const wml = findFile(FINAL_DIR, "wml.xsd");
	if (!wml) {
		throw new Error(`wml.xsd not found in extracted XSD set; aborting.`);
	}

	const xsdFiles = readdirSync(FINAL_DIR).filter((f) => f.endsWith(".xsd"));
	console.log(`\nDone. ${xsdFiles.length} XSD files in ${FINAL_DIR}:`);
	for (const f of xsdFiles.slice().sort()) console.log(`  ${f}`);

	if (!args.expectedSha256) {
		console.log("\nTo pin this fetch for reproducibility, paste the sha256 above into");
		console.log("data/sources.json under the 'ecma-376-transitional' entry, then re-run");
		console.log("`bun run db:sync-sources` to update the row.");
	}
}

main().catch((err) => {
	console.error("Fetch failed:", err);
	process.exit(1);
});
