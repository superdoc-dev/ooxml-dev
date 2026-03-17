import { docs } from "./docs";

export interface SeoMeta {
	title: string;
	description: string;
	type: "website" | "article";
}

const staticPages: Record<string, SeoMeta> = {
	"/": {
		title: "ooxml.dev — The Implementer's Guide to OOXML (ECMA-376)",
		description:
			"Interactive OOXML reference with live previews, implementation notes, and real-world gotchas. Built by the SuperDoc team.",
		type: "website",
	},
	"/mcp": {
		title: "ECMA-376 MCP Server — Search the OOXML Spec with AI | ooxml.dev",
		description:
			"Connect your AI assistant to search 18,000+ OOXML specification chunks. Works with Claude Code, Cursor, and any MCP-compatible client.",
		type: "website",
	},
	"/spec": {
		title: "ECMA-376 Spec Explorer | ooxml.dev",
		description:
			"Search and browse the ECMA-376 Office Open XML specification with semantic search and PDF viewer.",
		type: "website",
	},
	"/docs": {
		title: "OOXML Reference — Getting Started | ooxml.dev",
		description:
			"Learn the basics of OOXML (Office Open XML) and how to use this interactive reference.",
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
