/**
 * Fetch ECMA-376 Transitional XSDs from the ECMA Part 4 zip.
 *
 * The Part 4 zip is published by Ecma International on the ECMA-376
 * publications page. It contains OfficeOpenXML-XMLSchema-Transitional.zip,
 * which in turn contains the 26 Transitional XSDs (wml.xsd, dml-main.xsd,
 * sml.xsd, pml.xsd, shared-*.xsd, and friends).
 *
 * URL and sha256 are read from data/sources.json's ecma-376-transitional
 * entry by default. CLI flags and env vars override; useful for testing a
 * new edition before pinning it in the manifest.
 *
 * Cache layout:
 *   data/xsd-cache/
 *     _staging/                         (outer + inner zip extraction scratch)
 *     ecma-376-transitional/            (final XSDs land here)
 *
 * Usage:
 *   bun run xsd:fetch                                       (manifest default)
 *   bun run xsd:fetch -- --url <other-url>                  (override URL)
 *   bun run xsd:fetch -- --expected-sha256 <hex>            (override hash)
 *   XSD_PART4_URL=<url> bun run xsd:fetch                   (override via env)
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

interface SourceManifestEntry {
	name: string;
	url?: string;
	sha256?: string | null;
}

interface SourceManifest {
	sources: SourceManifestEntry[];
}

async function loadManifestDefault(): Promise<{ url: string | null; sha256: string | null }> {
	try {
		const raw = await Bun.file("./data/sources.json").text();
		const manifest = JSON.parse(raw) as SourceManifest;
		const ecma = manifest.sources?.find((s) => s.name === "ecma-376-transitional");
		return {
			url: ecma?.url ?? null,
			sha256: ecma?.sha256 ?? null,
		};
	} catch {
		return { url: null, sha256: null };
	}
}

async function parseArgs(): Promise<Args> {
	const argv = process.argv.slice(2);
	let url: string | null = process.env.XSD_PART4_URL ?? null;
	let expectedSha256: string | null = null;
	let innerZip = DEFAULT_INNER_ZIP;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--url") url = argv[++i] ?? null;
		else if (a === "--expected-sha256") expectedSha256 = argv[++i] ?? null;
		else if (a === "--inner-zip") innerZip = argv[++i] ?? DEFAULT_INNER_ZIP;
	}

	// Fall back to the manifest for any unset values. data/sources.json is
	// the canonical pin; we treat it as the default config so the common case
	// is just `bun run xsd:fetch`.
	if (!url || !expectedSha256) {
		const fromManifest = await loadManifestDefault();
		if (!url) url = fromManifest.url;
		if (!expectedSha256) expectedSha256 = fromManifest.sha256;
	}

	if (!url) {
		console.error(
			"No URL configured. Set 'url' on the ecma-376-transitional entry in data/sources.json,",
		);
		console.error("or pass --url / XSD_PART4_URL.");
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
	const args = await parseArgs();

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
