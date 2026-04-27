/**
 * Phase 4 query layer tests. Ingests the same fixture XSDs the ingest tests use,
 * then exercises each MCP-tool query function against the populated DB.
 */

import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";
import { ingestSchemaSet } from "../../scripts/ingest-xsd/ingest.ts";
import {
	getAttributes,
	getChildren,
	getEnums,
	getNamespaceInfo,
	lookupElement,
	lookupSymbolByTypeRef,
	lookupType,
	parseQName,
} from "../../apps/mcp-server/src/ooxml-queries.ts";

const FIXTURES_DIR = join(import.meta.dir, "..", "ingest-xsd", "fixtures");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL for integration tests");

let db: DbClient;

const TRUNCATE_SQL = `
	TRUNCATE
		behavior_notes,
		xsd_enums,
		xsd_inheritance_edges,
		xsd_group_edges,
		xsd_attr_edges,
		xsd_child_edges,
		xsd_compositors,
		xsd_symbol_profiles,
		xsd_symbols,
		xsd_namespaces,
		xsd_profiles
	RESTART IDENTITY CASCADE
`;

beforeAll(async () => {
	db = createDbClient(databaseUrl);
	await db.sql`
		INSERT INTO reference_sources (name, kind)
		VALUES ('ecma-376-transitional', 'xsd')
		ON CONFLICT (name) DO NOTHING
	`;
	await db.sql.unsafe(TRUNCATE_SQL);
	await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});
});

afterAll(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
	await db.close();
});

const WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SHARED_NS = "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes";

test("parseQName: prefixed, Clark, bare", () => {
	const a = parseQName("w:tbl");
	expect(a.ok).toBe(true);
	if (a.ok) {
		expect(a.qname.namespace).toBe(WML_NS);
		expect(a.qname.localName).toBe("tbl");
	}

	const b = parseQName("{http://example.com}foo");
	expect(b.ok).toBe(true);
	if (b.ok) {
		expect(b.qname.namespace).toBe("http://example.com");
		expect(b.qname.localName).toBe("foo");
	}

	const c = parseQName("CT_Tbl");
	expect(c.ok).toBe(true);
	if (c.ok) expect(c.qname.namespace).toBe(WML_NS); // bare default

	const d = parseQName("zzz:something");
	expect(d.ok).toBe(false);
});

test("lookupElement: top-level element with type_ref", async () => {
	const hit = await lookupElement(db.sql, WML_NS, "document", "transitional");
	expect(hit?.localName).toBe("document");
	expect(hit?.kind).toBe("element");
	expect(hit?.typeRef).toBe(`{${WML_NS}}CT_Empty`);
	expect(hit?.profileName).toBe("transitional");
	expect(hit?.namespaceUri).toBe(WML_NS);
});

test("lookupElement: local element (text inside CT_Para) is in the profile", async () => {
	const hit = await lookupElement(db.sql, WML_NS, "text", "transitional");
	expect(hit).not.toBeNull();
	expect(hit?.typeRef).toBe("{http://www.w3.org/2001/XMLSchema}string");
});

test("lookupType: complexType vs simpleType disambiguation", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Para", "transitional");
	expect(ct?.kind).toBe("complexType");

	const st = await lookupType(db.sql, WML_NS, "ST_Jc", "transitional");
	expect(st?.kind).toBe("simpleType");

	const sharedSt = await lookupType(db.sql, SHARED_NS, "ST_OnOff", "transitional");
	expect(sharedSt?.vocabularyId).toBe("shared-types");
});

test("lookupSymbolByTypeRef resolves Clark form", async () => {
	const hit = await lookupSymbolByTypeRef(db.sql, `{${WML_NS}}CT_Empty`, "transitional");
	expect(hit?.localName).toBe("CT_Empty");
	expect(hit?.kind).toBe("complexType");
});

test("getChildren: CT_Para has the local 'text' element via its sequence", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Para", "transitional");
	if (!ct) throw new Error("CT_Para not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	expect(children).toHaveLength(1);
	expect(children[0].localName).toBe("text");
	expect(children[0].compositorKind).toBe("sequence");
	expect(children[0].source).toBe("self");
});

test("getChildren: CT_Body returns ordered mix of elements + group ref", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Body", "transitional");
	if (!ct) throw new Error("CT_Body not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	// CT_Body content (top sequence): element ref="document", choice(group EG_PContent, element name="break")
	// getChildren returns the top sequence's edges; the nested choice's content is reachable via compositorId
	// pivot but not flattened automatically.
	const localNames = children.map((c) => c.localName).sort();
	expect(localNames).toContain("document");
	expect(localNames).toContain("EG_PContent");
	expect(localNames).toContain("break");
});

test("getChildren: inheritance is unioned (CT_Extended inherits from CT_Empty)", async () => {
	// CT_Extended extends CT_Empty (which has no content); CT_Extended itself has no
	// content model either, so children should be empty.
	const ct = await lookupType(db.sql, WML_NS, "CT_Extended", "transitional");
	if (!ct) throw new Error("CT_Extended not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	expect(children).toHaveLength(0);
});

test("getAttributes: CT_Para has 'bold' with type_ref to ST_OnOff", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Para", "transitional");
	if (!ct) throw new Error("CT_Para not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const bold = attrs.find((a) => a.localName === "bold");
	expect(bold?.attrUse).toBe("optional");
	expect(bold?.typeRef).toBe(`{${SHARED_NS}}ST_OnOff`);
});

test("getAttributes: CT_TableUser unfolds AG_TableProps via attributeGroup ref", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_TableUser", "transitional");
	if (!ct) throw new Error("CT_TableUser not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const names = attrs.map((a) => a.localName).sort();
	// caption is direct, cols comes from AG_TableProps.
	expect(names).toContain("caption");
	expect(names).toContain("cols");

	const cols = attrs.find((a) => a.localName === "cols");
	expect(cols?.source).toBe("attributeGroup");
	expect(cols?.owningName).toBe("AG_TableProps");

	const caption = attrs.find((a) => a.localName === "caption");
	expect(caption?.attrUse).toBe("required");
});

test("getAttributes: CT_Extended inherits 'extra' (declared on the extension)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Extended", "transitional");
	if (!ct) throw new Error("CT_Extended not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const extra = attrs.find((a) => a.localName === "extra");
	expect(extra?.attrUse).toBe("optional");
	expect(extra?.typeRef).toBe("{http://www.w3.org/2001/XMLSchema}string");
});

test("getEnums: ST_Jc returns left/center/right in order", async () => {
	const st = await lookupType(db.sql, WML_NS, "ST_Jc", "transitional");
	if (!st) throw new Error("ST_Jc not found");
	const enums = await getEnums(db.sql, st.id, "transitional");
	expect(enums.map((e) => e.value)).toEqual(["left", "center", "right"]);
});

test("getNamespaceInfo: reports profile membership and vocabularies", async () => {
	const info = await getNamespaceInfo(db.sql, WML_NS);
	expect(info?.uri).toBe(WML_NS);
	expect(info?.vocabularies).toContain("wml-main");
	expect(info?.profiles.find((p) => p.name === "transitional")?.symbolCount).toBeGreaterThan(0);

	// Unknown URI → null
	const none = await getNamespaceInfo(db.sql, "http://example.com/does-not-exist");
	expect(none).toBeNull();
});

test("lookupElement: returns null for unknown qname", async () => {
	const hit = await lookupElement(db.sql, WML_NS, "doesNotExist", "transitional");
	expect(hit).toBeNull();
});

test("getChildren: extension prepends base content (CT_DerivedExtended -> alpha, beta, gamma)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_DerivedExtended", "transitional");
	if (!ct) throw new Error("CT_DerivedExtended not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	const names = children.map((c) => c.localName);
	// XSD extension semantics: base content first, then derived.
	expect(names).toEqual(["alpha", "beta", "gamma"]);
	// Provenance distinguishes base-derived from self-derived.
	expect(children[0].source).toBe("inherited");
	expect(children[0].owningTypeName).toBe("CT_BaseWithChildren");
	expect(children[2].source).toBe("self");
	expect(children[2].owningTypeName).toBe("CT_DerivedExtended");
});

test("getChildren: nested compositor flatten preserves document order (CT_NestedOrder)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_NestedOrder", "transitional");
	if (!ct) throw new Error("CT_NestedOrder not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	// Top sequence: head, choice(branchA, branchB), tail.
	// Document order should be head, branchA, branchB, tail (NOT branchA first because
	// its order_index=0 inside the choice).
	const names = children.map((c) => c.localName);
	expect(names).toEqual(["head", "branchA", "branchB", "tail"]);

	// Compositor path makes the nesting visible.
	const head = children.find((c) => c.localName === "head");
	expect(head?.compositorPath).toEqual(["sequence(1..1)"]);

	const branchA = children.find((c) => c.localName === "branchA");
	expect(branchA?.compositorPath).toEqual(["sequence(1..1)", "choice(0..unbounded)"]);
});

test("getAttributes: nested attributeGroup chain unfolds (CT_NestedAttrUser -> innerAttr + outerAttr)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_NestedAttrUser", "transitional");
	if (!ct) throw new Error("CT_NestedAttrUser not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const names = attrs.map((a) => a.localName).sort();
	// CT_NestedAttrUser refs AG_Outer; AG_Outer refs AG_Inner.
	// Both attributes must surface.
	expect(names).toEqual(["innerAttr", "outerAttr"]);

	const inner = attrs.find((a) => a.localName === "innerAttr");
	expect(inner?.source).toBe("attributeGroup");
	expect(inner?.owningName).toBe("AG_Inner");

	const outer = attrs.find((a) => a.localName === "outerAttr");
	expect(outer?.source).toBe("attributeGroup");
	expect(outer?.owningName).toBe("AG_Outer");
});

test("element-to-type chain: lookup w-style element, follow type_ref, fetch children", async () => {
	// document → CT_Empty (no content) ⇒ children empty.
	const elem = await lookupElement(db.sql, WML_NS, "document", "transitional");
	expect(elem).not.toBeNull();
	if (!elem?.typeRef) throw new Error("expected type_ref");
	const type = await lookupSymbolByTypeRef(db.sql, elem.typeRef, "transitional");
	expect(type?.localName).toBe("CT_Empty");
	const children = await getChildren(db.sql, type!.id, "transitional");
	expect(children).toHaveLength(0);
});
