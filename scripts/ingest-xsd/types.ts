/**
 * Shared types for the XSD parser/ingest pipeline.
 */

/**
 * fast-xml-parser preserveOrder output:
 *   - Documents are arrays of single-key objects (one per top-level node).
 *   - Each element node has shape { tagName: children[], ":@"?: { "@_attr": value } }.
 *   - Text leaves are { "#text": string }.
 * We type these loosely and use helpers in ast.ts to navigate.
 */
export type PreserveOrderNode = Record<string, unknown>;
export type PreserveOrderDocument = PreserveOrderNode[];

/** A single XSD file, after parsing. */
export interface ParsedSchemaDocument {
	/** Path relative to schemaDir (e.g. "wml.xsd"). */
	path: string;
	absolutePath: string;
	targetNamespace: string;
	/** Stable id derived from targetNamespace via NAMESPACE_TO_VOCABULARY. */
	vocabularyId: string;
	/** The xsd:schema element from the preserveOrder AST; later passes walk it. */
	schemaNode: PreserveOrderNode;
}

/** xsd:import declared on a document. */
export interface ImportEdge {
	namespace: string;
	schemaLocation: string | null;
	/**
	 * Relative path of the resolved imported document (within schemaDir),
	 * or null when schemaLocation is absent (xml namespace, externally-supplied schemas).
	 */
	target: string | null;
}

/**
 * A top-level declaration discovered in a schema (xsd:element, complexType,
 * simpleType, group, attributeGroup, or globally-declared attribute).
 *
 * Top-level declarations are always in the document's targetNamespace; the
 * vocabularyId is therefore the document's vocabularyId.
 */
export type DeclarationKind =
	| "element"
	| "complexType"
	| "simpleType"
	| "group"
	| "attributeGroup"
	| "attribute";

export interface Declaration {
	kind: DeclarationKind;
	namespace: string;
	vocabularyId: string;
	localName: string;
	documentPath: string;
	node: PreserveOrderNode;
}

/**
 * Result of parsing a working set of XSDs.
 *
 * - documents: every loaded file, keyed by path relative to schemaDir
 * - namespaceByPrefix: per-document prefix → URI maps (each .xsd declares its own)
 * - importGraph: per-document outgoing xsd:import edges, with resolved targets
 * - declarationsByQName: canonical qname (Clark notation + kind) → declarations
 */
export interface ParsedSchemaSet {
	documents: Map<string, ParsedSchemaDocument>;
	namespaceByPrefix: Map<string, Map<string, string>>;
	importGraph: Map<string, ImportEdge[]>;
	declarationsByQName: Map<string, Declaration[]>;
}
