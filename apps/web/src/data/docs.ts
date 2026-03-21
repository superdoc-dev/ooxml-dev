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
				text: "This reference is actively being expanded. We're adding new sections, examples, and implementation notes regularly. Check our [GitHub](https://github.com/superdoc-dev/ooxml-dev) for updates and how to contribute.",
			},
			{ type: "heading", level: 2, text: "What's Different Here" },
			{
				type: "paragraph",
				text: "Unlike the official spec, this reference shows live previews, includes real implementation notes from building [SuperDoc](https://superdoc.dev/?utm_source=ooxml.dev&utm_medium=referral&utm_campaign=docs), and links to 100k+ real documents from [docx-corpus](https://docxcorp.us).",
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
    <w:t xml:space="preserve">Normal text, </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:b/></w:rPr>
    <w:t>bold text</w:t>
  </w:r>
  <w:r>
    <w:t xml:space="preserve">, and </w:t>
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

	"paragraph-borders": {
		title: "Paragraph Borders",
		description:
			"Borders and shading around paragraphs — side borders, between-border groups, and the space attribute.",
		badge: "w:pBdr",
		content: [
			{
				type: "paragraph",
				text: "Paragraph borders (`w:pBdr`) draw border lines around paragraphs and can group consecutive paragraphs into a single bordered box. The spec reads straightforward, but Word's rendering rules have several gotchas that aren't documented.",
			},
			{ type: "heading", level: 2, text: "Structure" },
			{
				type: "code",
				code: `w:pPr (paragraph properties)
└── w:pBdr (paragraph borders)
    ├── w:top (top border)
    ├── w:bottom (bottom border)
    ├── w:left (left border)
    ├── w:right (right border)
    ├── w:between (between border — separator within groups)
    └── w:bar (vertical bar border)

Each border element has:
├── @w:val     Border style (single, double, dashed, dotted, nil, none...)
├── @w:sz      Width in 1/8 of a point (sz="12" → 1.5pt)
├── @w:space   Distance from text to border, in points
└── @w:color   Hex color (e.g., "000000")`,
			},
			{ type: "heading", level: 2, text: "Basic Example" },
			{
				type: "preview",
				title: "Paragraph with all four borders",
				xml: `<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/>
    </w:pBdr>
  </w:pPr>
  <w:r><w:t>A paragraph with borders on all four sides.</w:t></w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Between Border Groups" },
			{
				type: "paragraph",
				text: "When consecutive paragraphs have identical border definitions AND include a `w:between` element, Word groups them into a single bordered box. The between border draws as a horizontal separator between group members.",
			},
			{
				type: "preview",
				title: "Two paragraphs grouped with a between border",
				xml: `<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:between w:val="single" w:sz="6" w:space="1" w:color="000000"/>
    </w:pBdr>
  </w:pPr>
  <w:r><w:t>First paragraph in the group.</w:t></w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:between w:val="single" w:sz="6" w:space="1" w:color="000000"/>
    </w:pBdr>
  </w:pPr>
  <w:r><w:t>Second paragraph — between border separates them.</w:t></w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Nil/None Between — Grouping Without a Separator" },
			{
				type: "paragraph",
				text: 'Setting `w:between` to `val="nil"` or `val="none"` does NOT mean "don\'t group." It means "group these paragraphs but don\'t draw a separator." The result is a single continuous bordered box with no divider between paragraphs.',
			},
			{
				type: "preview",
				title: "Grouped paragraphs with no separator (nil between)",
				xml: `<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:between w:val="nil"/>
    </w:pBdr>
  </w:pPr>
  <w:r><w:t>First paragraph — no between separator.</w:t></w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/>
      <w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/>
      <w:between w:val="nil"/>
    </w:pBdr>
  </w:pPr>
  <w:r><w:t>Second paragraph — continuous box, no divider.</w:t></w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "How Word Renders Groups" },
			{
				type: "paragraph",
				text: "The spec describes `w:between` but doesn't spell out the rendering rules. Here's what Word actually does with a group of 3 paragraphs:",
			},
			{
				type: "code",
				code: `┌─────────────────────────────┐  ← top border (from A)
│ Paragraph A text            │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← between border
│ Paragraph B text            │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← between border
│ Paragraph C text            │
└─────────────────────────────┘  ← bottom border (from C)

- A: top + left + right + between-as-bottom
- B: left + right + between-as-bottom (top suppressed)
- C: left + right + bottom (top suppressed)
- Left/right borders bridge paragraph spacing gaps`,
			},
			{ type: "heading", level: 2, text: "Implementation Notes" },
			{
				type: "note",
				noteType: "critical",
				title: "How between-border grouping works",
				text: 'Consecutive paragraphs form a group when they all have a `w:between` element AND all border properties match (top, bottom, left, right, between). Crucially, `val="nil"` or `val="none"` still triggers grouping — it means "group without a separator," not "don\'t group." If you normalize nil/none to `undefined` during parsing, you lose the grouping signal entirely.',
				app: "Word",
			},
			{
				type: "note",
				noteType: "warning",
				title: "The space attribute and unit mismatch",
				text: "The `space` attribute sets the distance (in points) between a border's inner edge and the text. For between borders, this padding applies on both sides — above and below. Note that `sz` uses a different unit: eighths of a point (`sz=\"12\"` = 1.5pt). Easy to mix up since they're on the same element.",
				app: "Word",
			},
			{ type: "heading", level: 2, text: "Schema" },
			{
				type: "table",
				headers: ["Element", "Description"],
				rows: [
					["`w:top`", "Top border"],
					["`w:bottom`", "Bottom border"],
					["`w:left`", "Left border"],
					["`w:right`", "Right border"],
					["`w:between`", "Border between grouped paragraphs"],
					["`w:bar`", "Vertical bar border (drawn outside the paragraph)"],
				],
			},
			{
				type: "table",
				headers: ["Attribute", "Type", "Description"],
				rows: [
					[
						"`w:val`",
						"ST_Border",
						"Border style — single, double, dashed, dotted, nil, none, etc.",
					],
					["`w:sz`", "integer", "Width in 1/8 of a point (e.g., 12 = 1.5pt)"],
					["`w:space`", "integer", "Distance from text to border inner edge, in points"],
					["`w:color`", "hex", "Border color (e.g., 000000, auto)"],
					["`w:shadow`", "boolean", "Shadow effect on the border"],
					["`w:frame`", "boolean", "Frame effect on the border"],
				],
			},
			{
				type: "paragraph",
				text: "Spec reference: ECMA-376 [§17.3.1.24 (pBdr)](/spec?section=17.3.1.24&part=1), [§17.3.1.7 (bottom border)](/spec?section=17.3.1.7&part=1), [§17.3.1.31 (shd)](/spec?section=17.3.1.31&part=1)",
			},
		],
	},

	"bidirectional-text": {
		title: "Bidirectional Text (RTL)",
		description:
			"Right-to-left paragraph layout, run-level text direction, and how bidi interacts with alignment, indentation, and tab stops.",
		badge: "w:bidi",
		content: [
			{
				type: "paragraph",
				text: "Bidirectional (bidi) support in OOXML handles right-to-left scripts like Arabic and Hebrew. It operates at two levels: `w:bidi` sets the paragraph's base direction, and `w:rtl` controls individual run reading order. Getting these right is the difference between text that renders correctly and text that's backwards.",
			},
			{ type: "heading", level: 2, text: "Structure" },
			{
				type: "code",
				code: `w:pPr (paragraph properties)
├── w:bidi          Paragraph base direction (RTL layout)
├── w:jc            Alignment — start/end are logical, flip with bidi
├── w:ind           Indentation — start/end flip with bidi
└── w:tabs
    └── w:tab       Tab stops — measured from leading edge (right for RTL)

w:rPr (run properties)
├── w:rtl           Run reading order (right-to-left)
├── w:cs            Treat run as complex script
├── w:rFonts        @w:cs — complex script font
└── w:lang          @w:bidi — bidi language (ar-SA, he-IL, etc.)`,
			},
			{ type: "heading", level: 2, text: "Paragraph Direction — w:bidi" },
			{
				type: "paragraph",
				text: "The `w:bidi` element on `w:pPr` sets the paragraph's base direction to right-to-left. This flips four things: indentation (start/end swap sides), alignment (start/end resolve to opposite edges), tab stop measurement (from right edge instead of left), and text flow direction. It does NOT reorder characters within runs — that's `w:rtl`'s job.",
			},
			{
				type: "preview",
				title: "RTL paragraph with Arabic text",
				xml: `<w:p>
  <w:pPr>
    <w:bidi/>
  </w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>مرحبا بالعالم</w:t>
  </w:r>
  <w:r>
    <w:t xml:space="preserve"> - Hello World</w:t>
  </w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Alignment with Bidi" },
			{
				type: "paragraph",
				text: 'The `w:jc` element uses logical values `start` and `end` that flip based on paragraph direction. `start` means the leading edge: left for LTR, right for RTL. `end` means the trailing edge. The values `left`, `right`, and `center` are always physical and don\'t flip. Arabic justify variants (`lowKashida`, `mediumKashida`, `highKashida`) extend joiners between characters instead of adding word spacing.',
			},
			{
				type: "preview",
				title: "RTL paragraph with center alignment",
				xml: `<w:p>
  <w:pPr>
    <w:bidi/>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>نص عربي في الوسط</w:t>
  </w:r>
</w:p>`,
			},
			{
				type: "preview",
				title: "RTL paragraph — start alignment resolves to right",
				xml: `<w:p>
  <w:pPr>
    <w:bidi/>
    <w:jc w:val="start"/>
  </w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>محاذاة البداية — تعني اليمين في الفقرات العربية</w:t>
  </w:r>
</w:p>`,
			},
			{
				type: "table",
				headers: ["w:jc value", "LTR result", "RTL result"],
				rows: [
					["`start`", "Left", "Right"],
					["`end`", "Right", "Left"],
					["`center`", "Center", "Center"],
					["`both`", "Justify (word spacing)", "Justify (word spacing + lowKashida)"],
					["`left`", "Left", "Left (physical, doesn't flip)"],
					["`right`", "Right", "Right (physical, doesn't flip)"],
					["`lowKashida`", "Justify", "Justify (short kashida extension)"],
					["`mediumKashida`", "Justify", "Justify (medium kashida)"],
					["`highKashida`", "Justify", "Justify (widest kashida)"],
					["`distribute`", "Justify (char + word spacing)", "Justify (char + word spacing)"],
				],
			},
			{ type: "heading", level: 2, text: "Indentation with Bidi" },
			{
				type: "paragraph",
				text: "The `w:ind` element uses `start`/`end` attributes that are logical — they refer to the leading and trailing edges of the paragraph. For an RTL paragraph, `start` is the right margin and `end` is the left margin. The `firstLine` and `hanging` attributes also apply relative to the start edge.",
			},
			{
				type: "preview",
				title: "RTL paragraph with start indent (appears on right side)",
				xml: `<w:p>
  <w:pPr>
    <w:bidi/>
    <w:ind w:start="720"/>
  </w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>فقرة مع مسافة بادئة من اليمين</w:t>
  </w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Tab Stops with Bidi" },
			{
				type: "paragraph",
				text: "Tab stop positions in RTL paragraphs are measured from the right edge of the text area, not the left. The `w:tab` alignment values `start` and `end` also flip. A `start`-aligned tab in an RTL paragraph aligns text to the right of the tab position.",
			},
			{
				type: "preview",
				title: "RTL paragraph with dot leader tab stop",
				xml: `<w:p>
  <w:pPr>
    <w:bidi/>
    <w:tabs>
      <w:tab w:val="left" w:pos="8640" w:leader="dot"/>
    </w:tabs>
  </w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>عنوان الفصل</w:t>
  </w:r>
  <w:r><w:tab/></w:r>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>٤٢</w:t>
  </w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Run-Level Direction — w:rtl" },
			{
				type: "paragraph",
				text: "The `w:rtl` element on `w:rPr` sets the reading order of a single run to right-to-left. This is separate from `w:bidi` — you can have an LTR paragraph with RTL runs (inline Arabic in English text) or an RTL paragraph with LTR runs (English words in Arabic text). The spec warns: don't use `w:rtl` on strong LTR characters — behavior is undefined.",
			},
			{
				type: "preview",
				title: "LTR paragraph with inline Arabic run",
				xml: `<w:p>
  <w:r>
    <w:t xml:space="preserve">English text then </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>نص عربي</w:t>
  </w:r>
  <w:r>
    <w:t xml:space="preserve"> then English again</w:t>
  </w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Mixed Document — RTL and LTR Paragraphs" },
			{
				type: "preview",
				title: "Document with alternating paragraph directions",
				xml: `<w:p>
  <w:pPr><w:bidi/></w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>هذه فقرة كاملة باللغة العربية</w:t>
  </w:r>
</w:p>
<w:p>
  <w:r>
    <w:t>This is a complete English paragraph</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr><w:bidi/></w:pPr>
  <w:r>
    <w:rPr><w:rtl/></w:rPr>
    <w:t>فقرة عربية أخرى بعد الإنجليزية</w:t>
  </w:r>
</w:p>`,
			},
			{ type: "heading", level: 2, text: "Implementation Notes" },
			{
				type: "note",
				noteType: "critical",
				title: "w:bidi and w:rtl are independent",
				text: "`w:bidi` flips paragraph layout (indentation, alignment, tabs, text direction). `w:rtl` on `w:rPr` controls run reading order. You need both — without `w:rtl` on the runs, text lands in the right position but characters read backwards.",
			},
			{
				type: "note",
				noteType: "critical",
				title: "Tab positions are from the right edge in RTL",
				text: "Tab `pos` is measured from the leading edge (§17.3.1.37). For RTL, that's the right margin. If your layout engine always measures from the left, every RTL tab stop lands on the wrong side.",
			},
			{
				type: "note",
				noteType: "warning",
				title: "start/end are logical, left/right are physical",
				text: "`jc=\"start\"` flips with direction; `jc=\"left\"` does not. Don't resolve `start` → `left` during import — you'll lose the logical intent. Same applies to `w:ind start`/`end` attributes.",
				app: "Word",
			},
			{
				type: "note",
				noteType: "info",
				title: "Section bidi is separate from paragraph bidi",
				text: "`w:sectPr > w:bidi` controls page chrome (page numbers, column order). It doesn't affect text. You need paragraph-level `w:bidi` for text layout.",
			},
			{ type: "heading", level: 2, text: "Schema" },
			{
				type: "table",
				headers: ["Element", "Parent", "Description"],
				rows: [
					["`w:bidi`", "`w:pPr`", "Paragraph base direction — sets RTL layout for indentation, alignment, tabs"],
					["`w:rtl`", "`w:rPr`", "Run reading order — right-to-left character ordering"],
					["`w:cs`", "`w:rPr`", "Complex script flag — forces complex script font/size"],
					["`w:bidi`", "`w:sectPr`", "Section layout direction — page-level RTL (separate from paragraph bidi)"],
				],
			},
			{
				type: "table",
				headers: ["Attribute / Value", "Context", "Description"],
				rows: [
					["`w:jc val=\"start\"`", "`w:pPr`", "Leading edge alignment — left for LTR, right for RTL"],
					["`w:jc val=\"end\"`", "`w:pPr`", "Trailing edge alignment — right for LTR, left for RTL"],
					["`w:ind start`", "`w:pPr`", "Leading edge indent — right side for RTL"],
					["`w:ind end`", "`w:pPr`", "Trailing edge indent — left side for RTL"],
					["`w:tab pos`", "`w:pPr > w:tabs`", "Tab position from leading edge — from right for RTL"],
					["`w:lang bidi`", "`w:rPr`", "Bidi language tag (ar-SA, he-IL) — affects neutral char resolution"],
				],
			},
			{
				type: "paragraph",
				text: "Spec reference: ECMA-376 [§17.3.1.6 (bidi)](/spec?section=17.3.1.6&part=1), [§17.3.2.30 (rtl)](/spec?section=17.3.2.30&part=1), [§17.3.1.13 (jc)](/spec?section=17.3.1.13&part=1), [§17.18.44 (ST_Jc)](/spec?section=17.18.44&part=1), [§17.3.1.37 (tab)](/spec?section=17.3.1.37&part=1), [§17.3.1.12 (ind)](/spec?section=17.3.1.12&part=1), [§I.2 (Bidi annex)](/spec?section=I.2&part=1)",
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
				text: "Lessons learned from building [SuperDoc](https://superdoc.dev/?utm_source=ooxml.dev&utm_medium=referral&utm_campaign=docs).",
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
