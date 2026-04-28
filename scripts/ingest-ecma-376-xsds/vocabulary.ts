/**
 * Canonical vocabulary IDs for OOXML namespaces.
 *
 * vocabulary_id is the stable identity used in xsd_symbols. Namespace URIs
 * are profile-scoped aliases (a future profile could rebind a vocabulary to
 * a different URI), so we don't key symbols by URI directly.
 *
 * Add an entry here when a new namespace appears. Unknown namespaces in
 * input XSDs are an error: bail loudly so we extend the map deliberately
 * rather than letting symbols land under an inferred id.
 */

export const NAMESPACE_TO_VOCABULARY: Record<string, string> = {
	// WordprocessingML
	"http://schemas.openxmlformats.org/wordprocessingml/2006/main": "wml-main",

	// SpreadsheetML
	"http://schemas.openxmlformats.org/spreadsheetml/2006/main": "sml-main",

	// PresentationML
	"http://schemas.openxmlformats.org/presentationml/2006/main": "pml-main",

	// DrawingML
	"http://schemas.openxmlformats.org/drawingml/2006/main": "dml-main",
	"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "dml-wp",
	"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing": "dml-sp",
	"http://schemas.openxmlformats.org/drawingml/2006/picture": "dml-pic",
	"http://schemas.openxmlformats.org/drawingml/2006/chart": "dml-chart",
	"http://schemas.openxmlformats.org/drawingml/2006/chartDrawing": "dml-chartDrawing",
	"http://schemas.openxmlformats.org/drawingml/2006/diagram": "dml-diagram",
	"http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas": "dml-lockedCanvas",

	// VML (legacy)
	"urn:schemas-microsoft-com:vml": "vml-main",
	"urn:schemas-microsoft-com:office:office": "vml-office",
	"urn:schemas-microsoft-com:office:word": "vml-word",
	"urn:schemas-microsoft-com:office:excel": "vml-excel",
	"urn:schemas-microsoft-com:office:powerpoint": "vml-powerpoint",

	// Shared / officeDocument family
	"http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes": "shared-types",
	"http://schemas.openxmlformats.org/officeDocument/2006/math": "shared-math",
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships": "shared-relationships",
	"http://schemas.openxmlformats.org/officeDocument/2006/customXml": "shared-customXml",
	"http://schemas.openxmlformats.org/officeDocument/2006/bibliography": "shared-bibliography",
	"http://schemas.openxmlformats.org/officeDocument/2006/characteristics":
		"shared-additionalCharacteristics",
	"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties":
		"shared-extendedProperties",
	"http://schemas.openxmlformats.org/officeDocument/2006/custom-properties":
		"shared-customProperties",
	"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes": "shared-docPropsVTypes",

	// Schema library (XML schema references)
	"http://schemas.openxmlformats.org/schemaLibrary/2006/main": "schemaLibrary-main",

	// W3C built-ins
	"http://www.w3.org/XML/1998/namespace": "xml",
	"http://www.w3.org/2001/XMLSchema": "xsd-builtin",
};

export function vocabularyForNamespace(uri: string): string {
	const v = NAMESPACE_TO_VOCABULARY[uri];
	if (!v) {
		throw new Error(
			`Unknown namespace URI: ${uri}. Add it to NAMESPACE_TO_VOCABULARY in scripts/ingest-ecma-376-xsds/vocabulary.ts.`,
		);
	}
	return v;
}
