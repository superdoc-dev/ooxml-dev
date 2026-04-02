import { docs } from "./docs";

export interface SeoMeta {
	title: string;
	description: string;
	type: "website" | "article";
}

const staticPages: Record<string, SeoMeta> = {
	"/": {
		title: "ooxml.dev — The OOXML spec, explained by people who actually implemented it",
		description:
			"Interactive ECMA-376 reference with live previews and implementation notes. What the spec doesn't tell you, from the SuperDoc team.",
		type: "website",
	},
	"/mcp": {
		title: "ECMA-376 MCP Server — Search the OOXML Spec with AI | ooxml.dev",
		description:
			"Search 18,000+ OOXML spec chunks with natural language. Works with Claude Code, Cursor, and any MCP-compatible client.",
		type: "website",
	},
	"/spec": {
		title: "ECMA-376 Spec Explorer — Search and Browse | ooxml.dev",
		description:
			"Semantic search across the full ECMA-376 Office Open XML specification. Find sections by meaning, not just keywords.",
		type: "website",
	},
	"/docs": {
		title: "OOXML Reference — Getting Started | ooxml.dev",
		description:
			"OOXML structure, namespaces, and how to use this reference. Live previews and implementation notes from building a real document engine.",
		type: "article",
	},
};

export function getSeoMeta(path: string): SeoMeta {
	if (staticPages[path]) {
		return staticPages[path];
	}

	const slug = path.replace("/docs/", "");
	const page = docs[slug];
	if (page) {
		const badge = page.badge ? ` (${page.badge})` : "";
		return {
			title: `${page.title}${badge} — ${page.description || "OOXML Reference"} | ooxml.dev`,
			description:
				page.description || `${page.title} — interactive OOXML reference with live previews.`,
			type: "article",
		};
	}

	return staticPages["/"];
}

export function getAllPaths(): string[] {
	const paths = ["/", "/mcp", "/spec", "/docs"];
	for (const slug of Object.keys(docs)) {
		if (slug === "index") continue;
		paths.push(`/docs/${slug}`);
	}
	return paths;
}
