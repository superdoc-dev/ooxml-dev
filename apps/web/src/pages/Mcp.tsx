import { useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { getSeoMeta } from "../data/seo";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const MCP_ENDPOINT = `${import.meta.env.VITE_API_URL}/mcp`;
const CLAUDE_COMMAND = `claude mcp add --transport http ooxml ${MCP_ENDPOINT}`;
const CODEX_COMMAND = `codex mcp add ooxml --transport http ${MCP_ENDPOINT}`;
const CODEX_TOML = `[mcp_servers.ooxml]
url = "${MCP_ENDPOINT}"`;

const PROSE_TOOLS = [
	{
		name: "ooxml_search",
		description:
			'Semantic search across the spec PDFs. Ask questions like "How do paragraph borders work?" or "What controls table cell margins?"',
	},
	{
		name: "ooxml_section",
		description: 'Retrieve a specific section by ID (e.g., "17.3.2" for paragraph properties).',
	},
	{
		name: "ooxml_parts",
		description: "Browse the specification structure. Filter by part (1-4) to explore sections.",
	},
];

const SCHEMA_TOOLS = [
	{
		name: "ooxml_element",
		description: "Look up an OOXML element by qname. Returns vocabulary, namespace, declared @type, and source.",
	},
	{
		name: "ooxml_type",
		description: "Look up a complexType or simpleType by qname. Tries complexType first, then simpleType.",
	},
	{
		name: "ooxml_children",
		description:
			"List the legal children of an element, complexType, or group in document order. Walks inheritance to union content from base types.",
	},
	{
		name: "ooxml_attributes",
		description:
			"List the attributes of an element or complexType. Walks inheritance and unfolds attributeGroup refs recursively.",
	},
	{
		name: "ooxml_enum",
		description: "List enumeration values for a simpleType, in declaration order.",
	},
	{
		name: "ooxml_namespace",
		description: "Show what's known about a namespace URI: vocabularies, profiles, symbol counts.",
	},
];

const EXAMPLE_QUERIES = [
	"How do I add borders to a table cell?",
	"What's the difference between w:pPr and w:rPr?",
	"What are the legal children of w:CT_Tbl?",
	"List all attributes of w:CT_R, including inherited ones.",
];

type TabId = "claude" | "codex" | "cursor" | "other";

export function Mcp() {
	useDocumentTitle(getSeoMeta("/mcp").title);
	const [copiedEndpoint, setCopiedEndpoint] = useState(false);
	const [copiedCommand, setCopiedCommand] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>("claude");

	const copyEndpoint = () => {
		navigator.clipboard.writeText(MCP_ENDPOINT);
		setCopiedEndpoint(true);
		setTimeout(() => setCopiedEndpoint(false), 2000);
	};

	const copyCommand = () => {
		navigator.clipboard.writeText(CLAUDE_COMMAND);
		setCopiedCommand(true);
		setTimeout(() => setCopiedCommand(false), 2000);
	};

	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar maxWidth />

			<main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
				{/* Header */}
				<div className="text-center mb-12">
					<div className="inline-flex items-center gap-2 bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-3 py-1 rounded-full text-sm font-medium mb-4">
						<span>⚡</span> MCP Server
					</div>
					<h1 className="text-3xl font-bold mb-4">OOXML reference for AI assistants</h1>
					<p className="text-[var(--color-text-secondary)] max-w-xl mx-auto">
						Two tool families: prose search across 18,000+ spec chunks, and deterministic schema
						lookup over the parsed XSDs. Ask in natural language, or query the structure directly.
					</p>
				</div>

				{/* Endpoint */}
				<div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 mb-8">
					<h2 className="font-semibold mb-3">Endpoint</h2>
					<div className="flex items-center gap-3 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-4 py-3">
						<code className="text-[var(--color-text-primary)] font-mono flex-1">
							{MCP_ENDPOINT}
						</code>
						<button
							onClick={copyEndpoint}
							className="text-xs font-medium bg-[var(--color-accent)] text-white px-3 py-1.5 rounded hover:bg-[var(--color-accent-hover)] transition-colors"
						>
							{copiedEndpoint ? "Copied!" : "Copy"}
						</button>
					</div>
				</div>

				{/* Quick Start */}
				<div className="mb-10">
					<h2 className="font-semibold mb-4">Quick Start</h2>
					<div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
						{/* Tabs */}
						<div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
							<TabButton active={activeTab === "claude"} onClick={() => setActiveTab("claude")}>
								Claude Code
							</TabButton>
							<TabButton active={activeTab === "codex"} onClick={() => setActiveTab("codex")}>
								Codex CLI
							</TabButton>
							<TabButton active={activeTab === "cursor"} onClick={() => setActiveTab("cursor")}>
								Cursor
							</TabButton>
							<TabButton active={activeTab === "other"} onClick={() => setActiveTab("other")}>
								Other
							</TabButton>
						</div>

						{/* Tab content */}
						<div className="p-4 bg-[var(--color-bg-primary)]">
							{activeTab === "claude" && (
								<>
									<p className="text-sm text-[var(--color-text-secondary)] mb-3">
										Run this command in your terminal:
									</p>
									<div className="flex items-center gap-2 bg-[var(--color-bg-code)] rounded-lg px-4 py-3">
										<code className="text-[var(--color-syntax-value)] font-mono text-sm flex-1">
											{CLAUDE_COMMAND}
										</code>
										<button
											onClick={copyCommand}
											className="text-[var(--color-text-muted)] hover:text-white text-sm transition shrink-0"
										>
											{copiedCommand ? "✓" : "📋"}
										</button>
									</div>
									<p className="text-xs text-[var(--color-text-muted)] mt-3">
										Then start a new conversation and ask about OOXML elements.
									</p>
								</>
							)}
							{activeTab === "codex" && (
								<>
									<p className="text-sm text-[var(--color-text-secondary)] mb-3">
										Run this command in your terminal:
									</p>
									<div className="flex items-center gap-2 bg-[var(--color-bg-code)] rounded-lg px-4 py-3 mb-3">
										<code className="text-[var(--color-syntax-value)] font-mono text-sm flex-1">
											{CODEX_COMMAND}
										</code>
									</div>
									<p className="text-sm text-[var(--color-text-secondary)] mb-3">
										Or add this entry to <code>~/.codex/config.toml</code>:
									</p>
									<div className="bg-[var(--color-bg-code)] rounded-lg px-4 py-3">
										<pre className="text-[var(--color-syntax-value)] font-mono text-sm overflow-x-auto">
											{CODEX_TOML}
										</pre>
									</div>
								</>
							)}
							{activeTab === "cursor" && (
								<>
									<p className="text-sm text-[var(--color-text-secondary)] mb-3">
										Add the following to your Cursor MCP settings:
									</p>
									<div className="bg-[var(--color-bg-code)] rounded-lg px-4 py-3">
										<pre className="text-[var(--color-syntax-value)] font-mono text-sm overflow-x-auto">
											{JSON.stringify(
												{
													mcpServers: {
														ooxml: {
															url: MCP_ENDPOINT,
														},
													},
												},
												null,
												2,
											)}
										</pre>
									</div>
								</>
							)}
							{activeTab === "other" && (
								<>
									<p className="text-sm text-[var(--color-text-secondary)] mb-3">
										Use the endpoint URL with any MCP-compatible client:
									</p>
									<div className="flex items-center gap-2 bg-[var(--color-bg-code)] rounded-lg px-4 py-3">
										<code className="text-[var(--color-syntax-value)] font-mono text-sm flex-1">
											{MCP_ENDPOINT}
										</code>
									</div>
									<p className="text-xs text-[var(--color-text-muted)] mt-3">
										This server uses HTTP transport. Check your client's documentation for
										configuration details.
									</p>
								</>
							)}
						</div>
					</div>
				</div>

				{/* Prose search tools */}
				<div className="mb-10">
					<h2 className="font-semibold mb-2">Prose search</h2>
					<p className="text-sm text-[var(--color-text-secondary)] mb-4">
						Natural-language search over the ECMA-376 spec PDFs.
					</p>
					<div className="space-y-3">
						{PROSE_TOOLS.map((tool) => (
							<div key={tool.name} className="border border-[var(--color-border)] rounded-lg p-4">
								<div className="flex items-start gap-3">
									<code className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] px-2 py-1 rounded text-sm font-mono shrink-0">
										{tool.name}
									</code>
									<p className="text-sm text-[var(--color-text-secondary)]">{tool.description}</p>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Schema lookup tools */}
				<div className="mb-10">
					<h2 className="font-semibold mb-2">Schema lookup</h2>
					<p className="text-sm text-[var(--color-text-secondary)] mb-4">
						Deterministic queries over the parsed XSD graph.
					</p>
					<div className="space-y-3">
						{SCHEMA_TOOLS.map((tool) => (
							<div key={tool.name} className="border border-[var(--color-border)] rounded-lg p-4">
								<div className="flex items-start gap-3">
									<code className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] px-2 py-1 rounded text-sm font-mono shrink-0">
										{tool.name}
									</code>
									<p className="text-sm text-[var(--color-text-secondary)]">{tool.description}</p>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Example Queries */}
				<div className="mb-10">
					<h2 className="font-semibold mb-4">Example Queries</h2>
					<div className="grid gap-2">
						{EXAMPLE_QUERIES.map((query) => (
							<div
								key={query}
								className="flex items-center gap-3 bg-[var(--color-bg-secondary)] rounded-lg px-4 py-3 text-sm"
							>
								<span className="text-[var(--color-text-muted)]">→</span>
								<span className="text-[var(--color-text-primary)]">"{query}"</span>
							</div>
						))}
					</div>
				</div>

				{/* What is MCP */}
				<div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6">
					<h2 className="font-semibold mb-3">What is MCP?</h2>
					<p className="text-sm text-[var(--color-text-secondary)] mb-3">
						The{" "}
						<a
							href="https://modelcontextprotocol.io"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 hover:decoration-[var(--color-accent)]"
						>
							Model Context Protocol
						</a>{" "}
						(MCP) is an open standard that lets AI assistants connect to external data sources and
						tools.
					</p>
					<p className="text-sm text-[var(--color-text-secondary)]">
						By connecting to this MCP server, your AI assistant gains both prose search across the
						ECMA-376 specification and deterministic schema lookup over the parsed XSDs—making it
						much easier to work with Office Open XML.
					</p>
				</div>
			</main>

			{/* Footer */}
			<div className="border-t border-[var(--color-border)] mt-12">
				<div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 flex items-center justify-between">
					<span className="text-sm text-[var(--color-text-muted)]">
						Built by 🦋{" "}
						<a
							href="https://superdoc.dev/?utm_source=ooxml.dev&utm_medium=referral&utm_campaign=mcp-page"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 hover:decoration-[var(--color-accent)]"
						>
							SuperDoc — DOCX editing and tooling
						</a>
					</span>
					<Link
						to="/docs/"
						className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
					>
						Back to Docs →
					</Link>
				</div>
			</div>
		</div>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			className={`px-4 py-2 text-sm font-medium transition ${
				active
					? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] bg-[var(--color-bg-primary)] -mb-px"
					: "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
			}`}
		>
			{children}
		</button>
	);
}
