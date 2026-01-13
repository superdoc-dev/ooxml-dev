import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import arrowEditor from "../assets/arrow-editor.png";

interface SuperDocPreviewProps {
	xml: string;
	title?: string;
}

// Parse XML and extract editable values with their positions
interface EditableValue {
	id: string;
	value: string;
	type: "attr" | "text";
}

function parseXmlWithEditables(xml: string): {
	parts: Array<{ type: "static" | "editable"; content: string; id?: string }>;
	values: Map<string, EditableValue>;
} {
	const parts: Array<{
		type: "static" | "editable";
		content: string;
		id?: string;
	}> = [];
	const values = new Map<string, EditableValue>();
	let idCounter = 0;

	// Match tags and text content between tags
	const regex = /(<[^>]*?>|[^<]+)/g;

	for (const match of xml.matchAll(regex)) {
		const segment = match[0];

		if (segment.startsWith("<")) {
			// It's a tag - keep as static (no attribute editing)
			parts.push({ type: "static", content: segment });
		} else if (segment.trim()) {
			// It's text content - make it editable
			const id = `text-${idCounter++}`;
			// Preserve leading whitespace as static
			const leadingWs = segment.match(/^(\s*)/)?.[1] || "";
			const trailingWs = segment.match(/(\s*)$/)?.[1] || "";
			const content = segment.trim();

			if (leadingWs) parts.push({ type: "static", content: leadingWs });
			if (content) {
				parts.push({ type: "editable", content, id });
				values.set(id, { id, value: content, type: "text" });
			}
			if (trailingWs && trailingWs !== leadingWs)
				parts.push({ type: "static", content: trailingWs });
		} else {
			// Whitespace only
			parts.push({ type: "static", content: segment });
		}
	}

	return { parts, values };
}

function reconstructXml(
	parts: Array<{ type: "static" | "editable"; content: string; id?: string }>,
	values: Map<string, string>,
): string {
	return parts
		.map((part) => {
			if (part.type === "editable" && part.id) {
				return values.get(part.id) ?? part.content;
			}
			return part.content;
		})
		.join("");
}

// Syntax highlighting for static parts
function highlightXml(content: string): React.ReactNode {
	// Simple highlighting for tag names and attribute names
	return content.split(/(<\/?[a-zA-Z0-9_:-]+|[a-zA-Z0-9_:-]+(?=="))/g).map((part, i) => {
		if (part.match(/^<\/?[a-zA-Z0-9_:-]+$/)) {
			// Tag name (including < or </)
			return (
				<span key={i} className="text-cyan-400">
					{part}
				</span>
			);
		}
		if (part.match(/^[a-zA-Z0-9_:-]+$/) && i > 0) {
			// Attribute name
			return (
				<span key={i} className="text-purple-300">
					{part}
				</span>
			);
		}
		return part;
	});
}

declare global {
	interface Window {
		SuperDocLibrary?: {
			SuperDoc: new (config: {
				selector: string;
				document?: Blob;
				documentMode?: string;
				onReady?: () => void;
			}) => { destroy?: () => void };
		};
	}
}

// Minimal DOCX structure templates
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function wrapInDocument(xmlSnippet: string): string {
	// If it's already a full document, return as-is
	if (xmlSnippet.includes("<w:document")) {
		return xmlSnippet;
	}

	// Wrap the snippet in a document structure
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${xmlSnippet}
  </w:body>
</w:document>`;
}

async function createDocxBlob(xmlSnippet: string): Promise<Blob> {
	const zip = new JSZip();

	zip.file("[Content_Types].xml", CONTENT_TYPES);
	zip.folder("_rels")?.file(".rels", RELS);
	zip.folder("word")?.file("document.xml", wrapInDocument(xmlSnippet));

	return await zip.generateAsync({
		type: "blob",
		mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	});
}

export function SuperDocPreview({ xml, title = "Example" }: SuperDocPreviewProps) {
	const trimmedXml = xml.trim();

	// Parse XML and extract editable values - recalculate when xml changes
	const { parts: parsedParts, initialValues } = useMemo(() => {
		const { parts, values } = parseXmlWithEditables(trimmedXml);
		const initialValues = new Map(Array.from(values.entries()).map(([k, v]) => [k, v.value]));
		return { parts, initialValues };
	}, [trimmedXml]);

	const [editedValues, setEditedValues] = useState<Map<string, string>>(initialValues);
	const [debouncedXml, setDebouncedXml] = useState(trimmedXml);
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(true);
	const editorRef = useRef<{ destroy?: () => void } | null>(null);
	const containerIdRef = useRef(`preview-${Math.random().toString(36).slice(2, 9)}`);

	// Reset edited values when xml prop changes
	useEffect(() => {
		setEditedValues(initialValues);
		setDebouncedXml(trimmedXml);
	}, [trimmedXml, initialValues]);

	const currentXml = reconstructXml(parsedParts, editedValues);

	const handleCopy = () => {
		navigator.clipboard.writeText(currentXml);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleValueChange = useCallback((id: string, newValue: string) => {
		setEditedValues((prev) => {
			const next = new Map(prev);
			next.set(id, newValue);
			return next;
		});
	}, []);

	// Debounce XML changes
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedXml(currentXml);
		}, 500);
		return () => clearTimeout(timer);
	}, [currentXml]);

	// Load SuperDoc script and CSS once
	useEffect(() => {
		if (!document.querySelector('link[href*="superdoc"]')) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = "https://unpkg.com/superdoc@latest/dist/style.css";
			document.head.appendChild(link);
		}

		if (!document.querySelector('script[src*="superdoc"]')) {
			const script = document.createElement("script");
			script.src = "https://unpkg.com/superdoc@latest/dist/superdoc.umd.js";
			document.body.appendChild(script);
		}
	}, []);

	// Initialize/update SuperDoc when debounced XML changes
	useEffect(() => {
		let mounted = true;

		const initEditor = async () => {
			if (!window.SuperDocLibrary || !document.getElementById(containerIdRef.current)) {
				return;
			}

			// Destroy previous instance
			editorRef.current?.destroy?.();
			setLoading(true);

			try {
				const docxBlob = await createDocxBlob(debouncedXml);

				if (!mounted) return;

				editorRef.current = new window.SuperDocLibrary.SuperDoc({
					selector: `#${containerIdRef.current}`,
					document: docxBlob,
					documentMode: "viewing",
					onReady: () => {
						if (mounted) {
							setLoading(false);
						}
					},
				});
			} catch (err) {
				console.error("Failed to initialize SuperDoc preview:", err);
				if (mounted) setLoading(false);
			}
		};

		if (window.SuperDocLibrary) {
			initEditor();
		} else {
			const checkInterval = setInterval(() => {
				if (window.SuperDocLibrary) {
					clearInterval(checkInterval);
					initEditor();
				}
			}, 100);
			setTimeout(() => clearInterval(checkInterval), 5000);
		}

		return () => {
			mounted = false;
		};
	}, [debouncedXml]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			editorRef.current?.destroy?.();
		};
	}, []);

	return (
		<div className="my-6 relative">
			{/* Hand-drawn arrow pointing to SuperDoc */}
			<div className="hidden md:block absolute -right-2 -top-2 translate-x-full">
				<img src={arrowEditor} alt="This is SuperDoc" className="w-60" />
			</div>

			<div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
				{/* Header */}
				<div className="flex items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2">
					<span className="text-sm font-medium">{title}</span>
				</div>

				{/* Split view */}
				<div className="grid grid-cols-1 md:grid-cols-2">
					{/* Code panel - syntax highlighted with inline editable values */}
					<div className="bg-[var(--color-bg-code)] p-4 relative min-h-[200px] overflow-x-auto">
						<button
							onClick={handleCopy}
							className="absolute top-2 right-2 z-10 text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800 px-2 py-1 rounded"
						>
							{copied ? "Copied!" : "Copy"}
						</button>
						<pre className="text-sm font-mono leading-relaxed whitespace-pre text-zinc-300">
							{parsedParts.map((part, i) => {
								if (part.type === "editable" && part.id) {
									const value = editedValues.get(part.id) ?? part.content;
									return (
										<input
											key={i}
											type="text"
											value={value}
											onChange={(e) => handleValueChange(part.id!, e.target.value)}
											className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[var(--color-accent)]"
											style={{ width: `${Math.max(value.length + 1, 3)}ch` }}
											spellCheck={false}
										/>
									);
								}
								return <span key={i}>{highlightXml(part.content)}</span>;
							})}
						</pre>
					</div>

					{/* Preview panel - fixed height */}
					<div className="border-t md:border-t-0 md:border-l border-[var(--color-border)] bg-white overflow-hidden relative h-[300px]">
						<div id={containerIdRef.current} className="superdoc-preview" style={{ height: 300 }} />
						{loading && (
							<div className="absolute inset-0 flex items-center justify-center bg-white text-zinc-400 text-sm">
								Loading preview...
							</div>
						)}
					</div>
				</div>

				<style>{`
        #${containerIdRef.current} {
          height: 300px !important;
          overflow: hidden !important;
        }
        #${containerIdRef.current} .superdoc__layers {
          max-width: 100% !important;
          padding: 12px !important;
          height: 300px !important;
          overflow: hidden !important;
        }
        #${containerIdRef.current} .super-editor-container {
          min-width: unset !important;
          width: 100% !important;
          height: 280px !important;
          overflow: hidden !important;
        }
        #${containerIdRef.current} .super-editor {
          max-width: 100% !important;
          width: 100% !important;
          height: 280px !important;
          overflow: hidden !important;
        }
        #${containerIdRef.current} .editor-element {
          width: 100% !important;
          min-width: unset !important;
          transform: none !important;
          max-height: 260px !important;
          overflow: hidden !important;
        }
        #${containerIdRef.current} .ProseMirror {
          max-height: 260px !important;
          overflow: hidden !important;
        }
      `}</style>
			</div>
		</div>
	);
}
