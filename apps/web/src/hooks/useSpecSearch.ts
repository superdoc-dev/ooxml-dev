import { useCallback, useMemo, useState } from "react";
import { docs } from "../data/docs";

// MCP server response type
interface MCPSearchResult {
	id: number;
	partNumber: number;
	sectionId: string | null;
	title: string | null;
	content: string;
	contentType: string;
	score: number;
}

interface MCPSearchResponse {
	query: string;
	results: MCPSearchResult[];
}

// Extended result type with section ID for display
export interface SpecSearchResult {
	id: string;
	url: string;
	sectionId: string;
	title: string;
	description?: string;
}

// Local docs search result
export interface LocalSearchResult {
	id: string;
	url: string;
	type: "page" | "heading";
	content: string;
	breadcrumbs?: string[];
}

// Build local search index from docs
interface LocalSearchItem {
	id: string;
	url: string;
	title: string;
	description?: string;
	section?: string;
	content: string;
}

function buildLocalIndex(): LocalSearchItem[] {
	const items: LocalSearchItem[] = [];

	for (const [slug, page] of Object.entries(docs)) {
		const url = slug === "index" ? "/docs" : `/docs/${slug}`;

		// Add page title
		items.push({
			id: `page-${slug}`,
			url,
			title: page.title,
			description: page.description,
			content: `${page.title} ${page.description || ""}`.toLowerCase(),
		});

		// Add headings
		for (const block of page.content) {
			if (block.type === "heading") {
				items.push({
					id: `heading-${slug}-${block.text}`,
					url: `${url}#${block.text.toLowerCase().replace(/\s+/g, "-")}`,
					title: block.text,
					section: page.title,
					content: block.text.toLowerCase(),
				});
			}
		}
	}

	return items;
}

export function useSpecSearch() {
	const [search, setSearch] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [specResults, setSpecResults] = useState<SpecSearchResult[]>([]);
	const [specSearchTriggered, setSpecSearchTriggered] = useState(false);

	// Build local index once
	const localIndex = useMemo(() => buildLocalIndex(), []);

	// Local search (instant)
	const localResults = useMemo((): LocalSearchResult[] => {
		if (!search.trim()) return [];

		const query = search.toLowerCase();
		const matches = localIndex.filter((item) => item.content.includes(query));

		return matches.slice(0, 5).map((item) => ({
			id: item.id,
			url: item.url,
			type: item.section ? ("heading" as const) : ("page" as const),
			content: item.title,
			breadcrumbs: item.section
				? [item.section]
				: item.description
					? [item.description]
					: undefined,
		}));
	}, [search, localIndex]);

	// Spec search (on demand via MCP server)
	const doSpecSearch = useCallback(async (query: string) => {
		if (!query.trim()) {
			setSpecResults([]);
			return;
		}

		setIsLoading(true);
		setSpecSearchTriggered(true);

		try {
			const res = await fetch("https://api.ooxml.dev/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query, limit: 10 }),
			});
			const data: MCPSearchResponse = await res.json();

			const transformed: SpecSearchResult[] = data.results.map((r) => ({
				id: `spec-${r.id}`,
				url: r.sectionId ? `/docs/${r.sectionId}` : "#",
				sectionId: r.sectionId || "",
				title: r.title || r.content.slice(0, 60),
				description: r.title ? r.content.slice(0, 80) : undefined,
			}));

			setSpecResults(transformed);
		} catch (err) {
			console.error("Spec search failed:", err);
			setSpecResults([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const resetSearch = useCallback(() => {
		setSearch("");
		setSpecResults([]);
		setSpecSearchTriggered(false);
	}, []);

	return {
		search,
		setSearch,
		localResults,
		specResults,
		isLoading,
		specSearchTriggered,
		doSpecSearch,
		resetSearch,
	};
}
