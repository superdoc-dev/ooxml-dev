/**
 * Parser scaffolding tests.
 *
 * Primary tests use tiny fixture XSDs to keep the suite fast and independent
 * of the local cache. One optional smoke test runs against the real
 * data/xsd-cache/ecma-376-transitional/ if present.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parseSchemaSet } from "../../scripts/ingest-xsd/parse-schema.ts";
import { declarationQNameKey, resolveQNameAttr } from "../../scripts/ingest-xsd/qname.ts";
import type { Declaration, DeclarationKind } from "../../scripts/ingest-xsd/types.ts";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const REAL_CACHE_DIR = "./data/xsd-cache/ecma-376-transitional";
const realCacheReady = existsSync(join(REAL_CACHE_DIR, "wml.xsd"));

const WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SHARED_TYPES_NS = "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes";
const XSD_NS = "http://www.w3.org/2001/XMLSchema";

function countByKind(decls: Map<string, Declaration[]>): Record<DeclarationKind, number> {
	const out: Record<DeclarationKind, number> = {
		element: 0,
		complexType: 0,
		simpleType: 0,
		group: 0,
		attributeGroup: 0,
		attribute: 0,
	};
	for (const arr of decls.values()) {
		for (const d of arr) out[d.kind]++;
	}
	return out;
}

test("parseSchemaSet loads fixtures and follows imports transitively", async () => {
	const set = await parseSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
	});

	expect(set.documents.size).toBe(2);
	expect(set.documents.has("main.xsd")).toBe(true);
	expect(set.documents.has("shared.xsd")).toBe(true);

	const main = set.documents.get("main.xsd");
	expect(main?.targetNamespace).toBe(WML_NS);
	expect(main?.vocabularyId).toBe("wml-main");

	const shared = set.documents.get("shared.xsd");
	expect(shared?.targetNamespace).toBe(SHARED_TYPES_NS);
	expect(shared?.vocabularyId).toBe("shared-types");
});

test("namespaceByPrefix is per-document and captures default + named prefixes", async () => {
	const set = await parseSchemaSet({ schemaDir: FIXTURES_DIR, entrypoints: ["main.xsd"] });
	const mainPrefixes = set.namespaceByPrefix.get("main.xsd");
	expect(mainPrefixes?.get("")).toBe(WML_NS);
	expect(mainPrefixes?.get("s")).toBe(SHARED_TYPES_NS);
	expect(mainPrefixes?.get("xsd")).toBe(XSD_NS);

	// shared.xsd has its own prefix map.
	const sharedPrefixes = set.namespaceByPrefix.get("shared.xsd");
	expect(sharedPrefixes?.get("")).toBe(SHARED_TYPES_NS);
	expect(sharedPrefixes?.has("s")).toBe(false);
});

test("importGraph resolves schemaLocation to relative target paths", async () => {
	const set = await parseSchemaSet({ schemaDir: FIXTURES_DIR, entrypoints: ["main.xsd"] });
	const mainImports = set.importGraph.get("main.xsd");
	expect(mainImports).toHaveLength(1);
	expect(mainImports?.[0]).toMatchObject({
		namespace: SHARED_TYPES_NS,
		schemaLocation: "shared.xsd",
		target: "shared.xsd",
	});

	expect(set.importGraph.get("shared.xsd")).toEqual([]);
});

test("declarationsByQName indexes all top-level declarations across documents", async () => {
	const set = await parseSchemaSet({ schemaDir: FIXTURES_DIR, entrypoints: ["main.xsd"] });

	const counts = countByKind(set.declarationsByQName);
	// main.xsd: 1 element, 13 complexType, 1 simpleType, 1 group, 3 attributeGroup
	// shared.xsd: 2 simpleType, 1 attribute
	expect(counts.element).toBe(1);
	expect(counts.complexType).toBe(13);
	expect(counts.simpleType).toBe(3);
	expect(counts.group).toBe(1);
	expect(counts.attributeGroup).toBe(3);
	expect(counts.attribute).toBe(1);

	// Specific decl lookup by canonical key.
	const ctPara = set.declarationsByQName.get(declarationQNameKey(WML_NS, "complexType", "CT_Para"));
	expect(ctPara).toHaveLength(1);
	expect(ctPara?.[0].vocabularyId).toBe("wml-main");

	const stOnOff = set.declarationsByQName.get(
		declarationQNameKey(SHARED_TYPES_NS, "simpleType", "ST_OnOff"),
	);
	expect(stOnOff).toHaveLength(1);
	expect(stOnOff?.[0].documentPath).toBe("shared.xsd");
});

test("resolveQNameAttr: prefixed, unprefixed, and unresolved", async () => {
	const set = await parseSchemaSet({ schemaDir: FIXTURES_DIR, entrypoints: ["main.xsd"] });
	const prefixes = set.namespaceByPrefix.get("main.xsd");
	if (!prefixes) throw new Error("missing prefix map for fixture");

	const r1 = resolveQNameAttr("s:ST_OnOff", prefixes, WML_NS);
	expect(r1.resolved).toBe(true);
	if (r1.resolved) {
		expect(r1.qname.namespace).toBe(SHARED_TYPES_NS);
		expect(r1.qname.localName).toBe("ST_OnOff");
		expect(r1.qname.vocabularyId).toBe("shared-types");
	}

	const r2 = resolveQNameAttr("CT_Para", prefixes, WML_NS);
	expect(r2.resolved).toBe(true);
	if (r2.resolved) expect(r2.qname.namespace).toBe(WML_NS);

	const r3 = resolveQNameAttr("zzz:Whatever", prefixes, WML_NS);
	expect(r3.resolved).toBe(false);
	if (!r3.resolved) expect(r3.qname.reason).toBe("unknown-prefix");
});

test.skipIf(!realCacheReady)(
	"smoke: parses real wml.xsd from cache, counts declarations",
	async () => {
		const set = await parseSchemaSet({
			schemaDir: REAL_CACHE_DIR,
			entrypoints: ["wml.xsd"],
		});

		expect(set.documents.size).toBeGreaterThan(5);
		const wml = set.documents.get("wml.xsd");
		expect(wml?.vocabularyId).toBe("wml-main");
		expect(wml?.targetNamespace).toBe(WML_NS);

		// wml.xsd imports 5 schemas with schemaLocation + 1 (xml) without.
		const wmlImports = set.importGraph.get("wml.xsd");
		expect(wmlImports).toHaveLength(6);

		const counts = countByKind(set.declarationsByQName);
		// Sanity floors against the WML+imports working set. Real counts (5th ed):
		// complexType=820, simpleType=389, group=67, element=47, attribute=14, attributeGroup=8.
		expect(counts.complexType).toBeGreaterThan(500);
		expect(counts.simpleType).toBeGreaterThan(200);
		expect(counts.group).toBeGreaterThan(40);
		expect(counts.element).toBeGreaterThan(40);
	},
);
