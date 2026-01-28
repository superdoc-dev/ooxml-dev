import { useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "../components/Navbar";

const MCP_ENDPOINT = "https://api.ooxml.dev/mcp";
const CLAUDE_COMMAND = `claude mcp add --transport http ecma-spec ${MCP_ENDPOINT}`;

const TOOLS = [
	{
		name: "search_ecma_spec",
		description:
			'Semantic search across the specification. Ask questions like "How do paragraph borders work?" or "What controls table cell margins?"',
	},
	{
		name: "get_section",
		description: 'Retrieve a specific section by ID (e.g., "17.3.2" for paragraph properties).',
	},
	{
		name: "list_parts",
		description: "Browse the specification structure. Filter by part (1-4) to explore sections.",
	},
];

const EXAMPLE_QUERIES = [
	"How do I add borders to a table cell?",
	"What's the difference between w:pPr and w:rPr?",
	"How does numbering work in WordprocessingML?",
	"Explain the content model for w:document",
];

type TabId = "claude" | "cursor" | "other";

export function Mcp() {
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
					<h1 className="text-3xl font-bold mb-4">Search the ECMA-376 spec with AI</h1>
					<p className="text-[var(--color-text-secondary)] max-w-xl mx-auto">
						Connect your MCP-compatible client to search 18,000+ specification chunks using natural
						language queries.
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
														"ecma-spec": {
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

				{/* Available Tools */}
				<div className="mb-10">
					<h2 className="font-semibold mb-4">Available Tools</h2>
					<div className="space-y-3">
						{TOOLS.map((tool) => (
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
							className="text-[var(--color-accent)] hover:underline"
						>
							Model Context Protocol
						</a>{" "}
						(MCP) is an open standard that lets AI assistants connect to external data sources and
						tools.
					</p>
					<p className="text-sm text-[var(--color-text-secondary)]">
						By connecting to this MCP server, your AI assistant gains the ability to search and
						retrieve information from the ECMA-376 specification—making it much easier to work with
						Office Open XML.
					</p>
				</div>
			</main>

			{/* Footer */}
			<div className="border-t border-[var(--color-border)] mt-12">
				<div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 flex items-center justify-between">
					<span className="text-sm text-[var(--color-text-muted)]">
						Built by 🦋{" "}
						<a
							href="https://superdoc.io"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[var(--color-accent)] hover:underline"
						>
							SuperDoc
						</a>
					</span>
					<Link
						to="/docs"
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
