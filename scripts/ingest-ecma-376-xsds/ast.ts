/**
 * Helpers for navigating the preserveOrder AST emitted by fast-xml-parser.
 *
 * AST shape: every element is a single-key object { tagName: children[], ":@"?: { "@_attrName": value } }.
 * Text nodes are { "#text": string }. Children always live in an array, so sibling
 * order is preserved across different tag names.
 */

import type { PreserveOrderDocument, PreserveOrderNode } from "./types.ts";

/** Strip an XML namespace prefix from a tag name: "xsd:element" → "element". */
export function stripPrefix(tag: string): string {
	const colon = tag.indexOf(":");
	return colon < 0 ? tag : tag.slice(colon + 1);
}

/** Return the single tag name on a preserveOrder node, or null for non-element nodes. */
export function nodeTag(node: PreserveOrderNode): string | null {
	for (const k of Object.keys(node)) {
		if (k !== ":@") return k;
	}
	return null;
}

/** Return the children array of a preserveOrder element. */
export function nodeChildren(node: PreserveOrderNode): PreserveOrderNode[] {
	const tag = nodeTag(node);
	if (!tag) return [];
	const v = node[tag];
	return Array.isArray(v) ? (v as PreserveOrderNode[]) : [];
}

/** Return attributes on a preserveOrder element. fast-xml-parser nests them under ":@" with "@_" prefix. */
export function nodeAttrs(node: PreserveOrderNode): Record<string, string> {
	const raw = node[":@"];
	if (!raw || typeof raw !== "object") return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		const name = k.startsWith("@_") ? k.slice(2) : k;
		if (typeof v === "string") out[name] = v;
		else if (v != null) out[name] = String(v);
	}
	return out;
}

/**
 * Find the first element in `doc` (or under `parent`) whose stripped tag name
 * matches one of the given local names. Used to locate the xsd:schema root
 * regardless of whether the file uses `xsd:`, `xs:`, or no prefix.
 */
export function findFirstByLocalName(
	nodes: PreserveOrderDocument | PreserveOrderNode[],
	localNames: string[],
): PreserveOrderNode | null {
	for (const node of nodes) {
		const tag = nodeTag(node);
		if (tag && localNames.includes(stripPrefix(tag))) return node;
	}
	return null;
}

/**
 * Iterate immediate children of an element whose stripped tag name matches `localName`.
 */
export function* eachChildByLocalName(
	parent: PreserveOrderNode,
	localName: string,
): Generator<PreserveOrderNode> {
	for (const child of nodeChildren(parent)) {
		const tag = nodeTag(child);
		if (tag && stripPrefix(tag) === localName) yield child;
	}
}
