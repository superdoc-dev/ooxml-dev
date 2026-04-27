/**
 * Parse a working set of XSDs into an in-memory schema set.
 *
 * Walks xsd:import schemaLocation references recursively starting from
 * `entrypoints`, and indexes every top-level declaration by canonical qname.
 *
 * No DB writes here. Subsequent phases (3c+) walk documents/declarations to
 * produce xsd_symbols, edges, etc.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { eachChildByLocalName, findFirstByLocalName, nodeAttrs, stripPrefix } from "./ast.ts";
import { declarationQNameKey } from "./qname.ts";
import type {
	Declaration,
	DeclarationKind,
	ImportEdge,
	ParsedSchemaDocument,
	ParsedSchemaSet,
	PreserveOrderDocument,
	PreserveOrderNode,
} from "./types.ts";
import { vocabularyForNamespace } from "./vocabulary.ts";

const xmlParser = new XMLParser({
	preserveOrder: true,
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	parseAttributeValue: false,
	parseTagValue: false,
	trimValues: true,
});

const TOP_LEVEL_KINDS: Record<string, DeclarationKind> = {
	element: "element",
	complexType: "complexType",
	simpleType: "simpleType",
	group: "group",
	attributeGroup: "attributeGroup",
	attribute: "attribute",
};

export interface ParseSchemaSetOptions {
	schemaDir: string;
	entrypoints: string[];
}

export async function parseSchemaSet(opts: ParseSchemaSetOptions): Promise<ParsedSchemaSet> {
	const schemaDir = isAbsolute(opts.schemaDir) ? opts.schemaDir : resolve(opts.schemaDir);

	const documents = new Map<string, ParsedSchemaDocument>();
	const namespaceByPrefix = new Map<string, Map<string, string>>();
	const importGraph = new Map<string, ImportEdge[]>();
	const declarationsByQName = new Map<string, Declaration[]>();

	const queue: string[] = opts.entrypoints.map((p) => relPath(schemaDir, resolve(schemaDir, p)));

	while (queue.length) {
		const relPathInDir = queue.shift()!;
		if (documents.has(relPathInDir)) continue;

		const absolutePath = resolve(schemaDir, relPathInDir);
		const text = await readFile(absolutePath, "utf-8");
		const ast = xmlParser.parse(text) as PreserveOrderDocument;

		const schemaNode = findFirstByLocalName(ast, ["schema"]);
		if (!schemaNode) {
			throw new Error(`No xsd:schema root in ${absolutePath}`);
		}

		const attrs = nodeAttrs(schemaNode);
		const targetNamespace = attrs.targetNamespace;
		if (!targetNamespace) {
			throw new Error(`Schema in ${absolutePath} is missing targetNamespace`);
		}

		const prefixes = extractNamespacePrefixes(attrs);
		const imports = extractImports(schemaNode, schemaDir, absolutePath);

		const doc: ParsedSchemaDocument = {
			path: relPathInDir,
			absolutePath,
			targetNamespace,
			vocabularyId: vocabularyForNamespace(targetNamespace),
			schemaNode,
		};

		documents.set(relPathInDir, doc);
		namespaceByPrefix.set(relPathInDir, prefixes);
		importGraph.set(relPathInDir, imports);

		indexTopLevelDeclarations(doc, declarationsByQName);

		for (const edge of imports) {
			if (edge.target && !documents.has(edge.target)) {
				queue.push(edge.target);
			}
		}
	}

	return { documents, namespaceByPrefix, importGraph, declarationsByQName };
}

function extractNamespacePrefixes(attrs: Record<string, string>): Map<string, string> {
	const map = new Map<string, string>();
	for (const [name, value] of Object.entries(attrs)) {
		if (name === "xmlns") map.set("", value);
		else if (name.startsWith("xmlns:")) map.set(name.slice("xmlns:".length), value);
	}
	// The xml prefix is reserved (XML Namespaces 1.0 §3) and is bound to
	// http://www.w3.org/XML/1998/namespace whether or not the document
	// declares it explicitly. Schemas like wml.xsd reference xml:space without
	// an xmlns:xml declaration; bind it here so resolveQNameAttr can resolve.
	if (!map.has("xml")) map.set("xml", "http://www.w3.org/XML/1998/namespace");
	return map;
}

function extractImports(
	schemaNode: PreserveOrderNode,
	schemaDir: string,
	currentAbsPath: string,
): ImportEdge[] {
	const imports: ImportEdge[] = [];
	for (const importNode of eachChildByLocalName(schemaNode, "import")) {
		const a = nodeAttrs(importNode);
		const schemaLocation = a.schemaLocation ?? null;
		let target: string | null = null;
		if (schemaLocation) {
			const importedAbs = resolve(currentAbsPath, "..", schemaLocation);
			target = relPath(schemaDir, importedAbs);
		}
		imports.push({
			namespace: a.namespace ?? "",
			schemaLocation,
			target,
		});
	}
	return imports;
}

function indexTopLevelDeclarations(
	doc: ParsedSchemaDocument,
	declarationsByQName: Map<string, Declaration[]>,
): void {
	for (const child of nodeChildrenLocal(doc.schemaNode)) {
		const tag = nodeTagLocal(child);
		if (!tag) continue;
		const local = stripPrefix(tag);
		const kind = TOP_LEVEL_KINDS[local];
		if (!kind) continue;

		const a = nodeAttrs(child);
		const localName = a.name;
		if (!localName) continue;

		const decl: Declaration = {
			kind,
			namespace: doc.targetNamespace,
			vocabularyId: doc.vocabularyId,
			localName,
			documentPath: doc.path,
			node: child,
		};
		const key = declarationQNameKey(doc.targetNamespace, kind, localName);
		const arr = declarationsByQName.get(key);
		if (arr) arr.push(decl);
		else declarationsByQName.set(key, [decl]);
	}
}

// Local helpers (avoid pulling extra exports from ast.ts).
function nodeTagLocal(node: PreserveOrderNode): string | null {
	for (const k of Object.keys(node)) if (k !== ":@") return k;
	return null;
}
function nodeChildrenLocal(node: PreserveOrderNode): PreserveOrderNode[] {
	const tag = nodeTagLocal(node);
	if (!tag) return [];
	const v = node[tag];
	return Array.isArray(v) ? (v as PreserveOrderNode[]) : [];
}

function relPath(base: string, abs: string): string {
	const r = relative(base, normalize(abs));
	// Guard against escapes outside schemaDir.
	if (r.startsWith(`..${sep}`) || r === "..") {
		throw new Error(`Resolved path escapes schemaDir: ${abs} (base ${base})`);
	}
	return r;
}
