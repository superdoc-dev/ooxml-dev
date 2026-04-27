/**
 * QName resolution and canonical keys.
 *
 * Two distinct concerns:
 *
 * 1. Top-level declaration qnames are formed from the document's targetNamespace
 *    plus the local @name attribute. Use `declarationQNameKey(namespace, kind, localName)`
 *    to produce the canonical Clark-style key used in declarationsByQName.
 *
 * 2. QName-valued attributes (ref, type, base, substitutionGroup, etc.) hold a
 *    "prefix:localName" string. Resolution uses the document's xmlns:* declarations.
 *    `resolveQNameAttr` returns either a resolved tuple or "unresolved" - we never
 *    invent a namespace for an unknown prefix.
 */

import { NAMESPACE_TO_VOCABULARY } from "./vocabulary.ts";

export interface ResolvedQName {
	prefix: string;
	localName: string;
	namespace: string;
	vocabularyId: string | null;
}

export interface UnresolvedQName {
	prefix: string;
	localName: string;
	raw: string;
	reason: "unknown-prefix" | "unknown-namespace";
}

export type QNameResult =
	| { resolved: true; qname: ResolvedQName }
	| { resolved: false; qname: UnresolvedQName };

/**
 * Canonical key for the declarationsByQName map.
 * Clark-style namespace prefix plus the kind, e.g.:
 *   {http://schemas.openxmlformats.org/wordprocessingml/2006/main}complexType:CT_Tbl
 */
export function declarationQNameKey(namespace: string, kind: string, localName: string): string {
	return `{${namespace}}${kind}:${localName}`;
}

/**
 * Resolve a qname string ("prefix:localName" or just "localName") in the context
 * of a document's prefix → URI map. Unprefixed names use the empty-prefix entry
 * (xmlns="..." default), falling back to the supplied default namespace.
 *
 * Never throws: returns { resolved: false, ... } for unknown prefixes or
 * namespaces, so the caller can decide whether to surface or persist as-is.
 */
export function resolveQNameAttr(
	raw: string,
	prefixMap: Map<string, string>,
	defaultNamespace: string,
): QNameResult {
	if (!raw) {
		return {
			resolved: false,
			qname: { prefix: "", localName: "", raw, reason: "unknown-prefix" },
		};
	}

	const colon = raw.indexOf(":");
	let prefix = "";
	let localName = raw;
	if (colon >= 0) {
		prefix = raw.slice(0, colon);
		localName = raw.slice(colon + 1);
	}

	const namespace = prefix ? prefixMap.get(prefix) : (prefixMap.get("") ?? defaultNamespace);
	if (!namespace) {
		return {
			resolved: false,
			qname: { prefix, localName, raw, reason: "unknown-prefix" },
		};
	}

	const vocabularyId = NAMESPACE_TO_VOCABULARY[namespace] ?? null;
	return {
		resolved: true,
		qname: { prefix, localName, namespace, vocabularyId },
	};
}
