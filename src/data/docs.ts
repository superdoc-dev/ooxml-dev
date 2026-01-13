export interface DocPage {
	title: string;
	description?: string;
	badge?: string;
	content: ContentBlock[];
}

type ContentBlock =
	| { type: "heading"; level: 2 | 3 | 4; text: string }
	| { type: "paragraph"; text: string }
	| { type: "code"; code: string; language?: string }
	| { type: "preview"; xml: string; title?: string }
	| {
			type: "note";
			noteType: "critical" | "warning" | "info" | "tip";
			title: string;
			text: string;
			app?: string;
	  }
	| { type: "table"; headers: string[]; rows: string[][] };

export const docs: Record<string, DocPage> = {
	index: {
		title: "Getting Started",
		description: "Learn the basics of OOXML (Office Open XML) and how to use this reference.",
		content: [
			{
				type: "note",
				noteType: "info",
				title: "Work in Progress",
				text: "This reference is actively being expanded. We're adding new sections, examples, and implementation notes regularly. Check our [GitHub](https://github.com/superdoc-dev/ooxml.dev) for updates and how to contribute.",
			},
			{ type: "heading", level: 2, text: "What's Different Here" },
			{
				type: "paragraph",
				text: "Unlike the official spec, this reference shows live previews, includes real implementation notes from building [SuperDoc](https://superdoc.dev), and links to 100k+ real documents from [docx-corpus](https://docxcorp.us).",
			},
			{ type: "heading", level: 2, text: "OOXML Structure" },
			{
				type: "paragraph",
				text: "A .docx file is a ZIP archive containing XML files. The main content lives in word/document.xml.",
			},
			{
				type: "code",
				code: `document.docx/
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── word/
│   ├── document.xml      # Main content
│   ├── styles.xml        # Style definitions
│   └── numbering.xml     # List definitions
└── docProps/
    └── core.xml`,
			},
			{ type: "heading", level: 2, text: "Namespaces" },
			{
				type: "table",
				headers: ["Prefix", "Namespace", "Description"],
				rows: [
					["w:", "WordprocessingML", "Document content"],
					["wp:", "DrawingML Positioning", "Image/shape placement"],
					["a:", "DrawingML", "Graphics and shapes"],
					["r:", "Relationships", "Cross-references"],
				],
			},
		],
	},

	tables: {
		title: "Tables",
		description:
			"Complete guide to OOXML tables - structure, properties, and implementation gotchas.",
		badge: "w:tbl",
		content: [
			{
				type: "paragraph",
				text: "Tables in OOXML are built from rows (`w:tr`) and cells (`w:tc`). The spec dedicates 200+ pages to tables, but most implementations only need a subset.",
			},
			{ type: "heading", level: 2, text: "Structure" },
			{
				type: "code",
				code: `w:tbl (table)
├── w:tblPr (table properties)
│   ├── w:tblW (table width)
│   └── w:tblBorders (borders)
├── w:tblGrid (column grid)
│   └── w:gridCol (column definition)
└── w:tr (table row)
    └── w:tc (table cell)
        ├── w:tcPr (cell properties)
        └── w:p (content)`,
			},
			{ type: "heading", level: 2, text: "Example" },
			{
				type: "preview",
				title: "Basic 2×2 Table",
				xml: `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="2500"/>
    <w:gridCol w:w="2500"/>
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:p><w:r><w:t>Cell 1</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:p><w:r><w:t>Cell 2</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`,
			},
			{ type: "heading", level: 2, text: "Implementation Notes" },
			{
				type: "note",
				noteType: "critical",
				title: "tblGrid is required",
				text: "The spec marks `w:tblGrid` as optional. Word crashes without it. Always include it.",
				app: "Word",
			},
			{
				type: "note",
				noteType: "warning",
				title: "Width calculation varies",
				text: "When `w:gridCol` elements have explicit widths, `w:tblW` may be ignored. The actual table width becomes the sum of column widths.",
				app: "Word, LibreOffice",
			},
			{
				type: "note",
				noteType: "info",
				title: "Nested tables",
				text: "Tables can be nested inside `w:tc` elements. Each nested table is a complete `w:tbl` element with its own grid.",
			},
			{ type: "heading", level: 2, text: "Schema" },
			{
				type: "table",
				headers: ["Element", "Type", "Description"],
				rows: [
					["`w:tblPr`", "optional", "Table properties (width, alignment, borders)"],
					["`w:tblGrid`", "required*", "Column grid definition"],
					["`w:tr`", "1+", "Table rows"],
				],
			},
		],
	},

	paragraphs: {
		title: "Paragraphs",
		description: "Text structure and formatting in OOXML - paragraphs, runs, and text elements.",
		badge: "w:p",
		content: [
			{
				type: "paragraph",
				text: "Paragraphs (`w:p`) are the fundamental building block of WordprocessingML. They contain runs (`w:r`), which contain text (`w:t`).",
			},
			{ type: "heading", level: 2, text: "Structure" },
			{
				type: "code",
				code: `w:p (paragraph)
├── w:pPr (paragraph properties)
│   ├── w:pStyle (style reference)
│   ├── w:jc (justification)
│   └── w:spacing (line spacing)
└── w:r (run)
    ├── w:rPr (run properties)
    │   ├── w:b (bold)
    │   ├── w:i (italic)
    │   └── w:sz (font size)
    └── w:t (text)`,
			},
			{ type: "heading", level: 2, text: "Example" },
			{
				type: "preview",
				title: "Paragraph with formatting",
				xml: `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:t>Normal text, </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:b/></w:rPr>
    <w:t>bold text</w:t>
  </w:r>
  <w:r>
    <w:t>, and </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:i/></w:rPr>
    <w:t>italic text</w:t>
  </w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Implementation Notes" },
			{
				type: "note",
				noteType: "warning",
				title: "Whitespace handling",
				text: 'By default, leading/trailing whitespace in `w:t` is trimmed. Use `xml:space="preserve"` to keep spaces.',
				app: "All",
			},
			{
				type: "note",
				noteType: "info",
				title: "Empty paragraphs",
				text: "Empty paragraphs are valid and commonly used for spacing. They render as a blank line with the paragraph's line height.",
			},
		],
	},

	styles: {
		title: "Styles",
		description:
			"How styling works in OOXML - style definitions, inheritance, and direct formatting.",
		badge: "styles.xml",
		content: [
			{
				type: "paragraph",
				text: "OOXML uses a style system similar to CSS but with its own inheritance rules and quirks.",
			},
			{ type: "heading", level: 2, text: "Style Types" },
			{
				type: "table",
				headers: ["Type", "Element", "Description"],
				rows: [
					["Paragraph", 'w:style w:type="paragraph"', "Applied to entire paragraphs"],
					["Character", 'w:style w:type="character"', "Applied to runs within paragraphs"],
					["Table", 'w:style w:type="table"', "Applied to tables"],
					["Numbering", 'w:style w:type="numbering"', "List formatting"],
				],
			},
			{ type: "heading", level: 2, text: "Style Hierarchy" },
			{
				type: "paragraph",
				text: "Formatting is resolved in this order (later wins): 1) Document defaults, 2) Style definition, 3) Direct formatting.",
			},
			{
				type: "note",
				noteType: "warning",
				title: "Style inheritance is complex",
				text: "Paragraph styles can be `w:basedOn` other styles. Character styles can be linked to paragraph styles via `w:link`. Direct formatting always wins.",
			},
			{ type: "heading", level: 2, text: "Example Style Definition" },
			{
				type: "code",
				code: `<w:style w:type="paragraph" w:styleId="Heading1">
  <w:name w:val="Heading 1"/>
  <w:basedOn w:val="Normal"/>
  <w:next w:val="Normal"/>
  <w:pPr>
    <w:spacing w:before="480" w:after="120"/>
  </w:pPr>
  <w:rPr>
    <w:b/>
    <w:sz w:val="48"/>
  </w:rPr>
</w:style>`,
			},
		],
	},

	"creating-documents": {
		title: "Creating Documents",
		description: "Step-by-step guide to creating a valid OOXML document from scratch.",
		content: [
			{ type: "heading", level: 2, text: "Required Files" },
			{
				type: "paragraph",
				text: "At minimum, you need three files: `[Content_Types].xml`, `_rels/.rels`, and `word/document.xml`.",
			},
			{ type: "heading", level: 3, text: "1. Content_Types.xml" },
			{
				type: "code",
				code: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
			},
			{ type: "heading", level: 3, text: "2. _rels/.rels" },
			{
				type: "code",
				code: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
			},
			{ type: "heading", level: 3, text: "3. word/document.xml" },
			{
				type: "code",
				code: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Hello, World!</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`,
			},
			{
				type: "note",
				noteType: "tip",
				title: "Use a template",
				text: "In practice, start from an existing .docx created by Word. It includes all the boilerplate files Word expects.",
			},
		],
	},

	"common-gotchas": {
		title: "Common Gotchas",
		description: "Real-world implementation issues and how to solve them.",
		content: [
			{
				type: "paragraph",
				text: "Lessons learned from building [SuperDoc](https://superdoc.dev).",
			},
			{ type: "heading", level: 2, text: "Word-Specific Issues" },
			{
				type: "note",
				noteType: "critical",
				title: "tblGrid is required",
				text: "Despite the spec marking it optional, Word crashes without `w:tblGrid` in tables.",
				app: "Word",
			},
			{
				type: "note",
				noteType: "critical",
				title: "sectPr placement matters",
				text: "Section properties (`w:sectPr`) must be the last child of `w:body`. Word may corrupt the document otherwise.",
				app: "Word",
			},
			{
				type: "note",
				noteType: "warning",
				title: "rsid attributes",
				text: "Word adds `w:rsid*` attributes everywhere for revision tracking. They're optional but Word regenerates them on save.",
				app: "Word",
			},
			{ type: "heading", level: 2, text: "Cross-Application Issues" },
			{
				type: "note",
				noteType: "warning",
				title: "Font substitution",
				text: "If a font isn't available, each application substitutes differently. Embed fonts or stick to common ones.",
			},
			{
				type: "note",
				noteType: "info",
				title: "Measurement units",
				text: "OOXML uses multiple units: twips (1/20 pt), EMUs (914400/inch), half-points. Be careful with conversions.",
			},
			{ type: "heading", level: 2, text: "Unit Conversion Reference" },
			{
				type: "table",
				headers: ["Unit", "Full Name", "Conversion"],
				rows: [
					["twip", "Twentieth of a point", "20 twips = 1 pt"],
					["dxa", "Twip (alternate name)", "Same as twip"],
					["EMU", "English Metric Unit", "914400 EMU = 1 inch"],
					["half-point", "Half a point", "2 half-points = 1 pt"],
				],
			},
		],
	},
};
