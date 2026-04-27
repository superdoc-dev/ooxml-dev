/**
 * Phase 3b smoke: parse the real WML working set and print a summary.
 *
 * Verifies the parser end-to-end against the live cache before Phase 3c
 * starts writing symbols/edges to the DB.
 *
 * Usage:
 *   bun scripts/ingest-xsd/smoke.ts
 *   bun scripts/ingest-xsd/smoke.ts --schema-dir ./some/dir --entrypoint wml.xsd
 */

import { parseSchemaSet } from "./parse-schema.ts";
import type { DeclarationKind } from "./types.ts";

interface Args {
	schemaDir: string;
	entrypoints: string[];
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	let schemaDir = "./data/xsd-cache/ecma-376-transitional";
	const entrypoints: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--schema-dir") schemaDir = argv[++i] ?? schemaDir;
		else if (a === "--entrypoint") entrypoints.push(argv[++i] ?? "");
	}
	if (entrypoints.length === 0) entrypoints.push("wml.xsd");
	return { schemaDir, entrypoints };
}

async function main() {
	const args = parseArgs();
	const set = await parseSchemaSet({
		schemaDir: args.schemaDir,
		entrypoints: args.entrypoints,
	});

	console.log(`schemaDir: ${args.schemaDir}`);
	console.log(`entrypoints: ${args.entrypoints.join(", ")}`);
	console.log(`documents loaded: ${set.documents.size}\n`);

	for (const ep of args.entrypoints) {
		const doc = set.documents.get(ep);
		if (!doc) continue;
		console.log(`${ep}`);
		console.log(`  targetNamespace: ${doc.targetNamespace}`);
		console.log(`  vocabularyId:    ${doc.vocabularyId}`);
		const imports = set.importGraph.get(ep) ?? [];
		console.log(`  imports (${imports.length}):`);
		for (const imp of imports) {
			console.log(`    ${imp.namespace}  →  ${imp.target ?? "(no schemaLocation)"}`);
		}
		console.log();
	}

	const counts: Record<DeclarationKind, number> = {
		element: 0,
		complexType: 0,
		simpleType: 0,
		group: 0,
		attributeGroup: 0,
		attribute: 0,
	};
	for (const arr of set.declarationsByQName.values()) {
		for (const d of arr) counts[d.kind]++;
	}
	console.log("declaration counts (across all loaded documents):");
	for (const k of Object.keys(counts).sort() as DeclarationKind[]) {
		console.log(`  ${k.padEnd(16)} ${counts[k]}`);
	}
}

main().catch((err) => {
	console.error("smoke failed:", err);
	process.exit(1);
});
