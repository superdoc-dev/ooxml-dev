import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { PdfViewer } from "../components/PdfViewer";

// MCP server response type
interface MCPSearchResult {
	id: number;
	partNumber: number;
	sectionId: string | null;
	title: string | null;
	content: string;
	contentType: string;
	pageNumber: number | null;
	score: number;
}

interface MCPSearchResponse {
	query: string;
	results: MCPSearchResult[];
}

// Search result type
interface SpecSearchResult {
	id: string;
	sectionId: string;
	title: string;
	description?: string;
	partNumber: number;
	pageNumber: number | null;
}

// Default PDF URL for preloading
const DEFAULT_PDF_URL = "https://cdn.ooxml.dev/ecma-376/part1.pdf";

export function SpecExplorer() {
	const [searchParams] = useSearchParams();
	const initialQuery = searchParams.get("q") || "";
	const [search, setSearch] = useState(initialQuery);
	const [submittedSearch, setSubmittedSearch] = useState("");
	const [results, setResults] = useState<SpecSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedResult, setSelectedResult] = useState<SpecSearchResult | null>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const hasAutoSearched = useRef(false);

	// Preload the default PDF
	useEffect(() => {
		const link = document.createElement("link");
		link.rel = "preload";
		link.as = "document";
		link.href = DEFAULT_PDF_URL;
		document.head.appendChild(link);
		return () => {
			document.head.removeChild(link);
		};
	}, []);

	// Submit search
	const handleSubmit = useCallback(async () => {
		const query = search.trim();
		if (!query || query === submittedSearch) return;

		setSubmittedSearch(query);
		setIsLoading(true);

		try {
			const res = await fetch(`${import.meta.env.VITE_API_URL}/search`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query, limit: 10 }),
			});
			const data: MCPSearchResponse = await res.json();

			const transformed: SpecSearchResult[] = data.results.map((r) => ({
				id: `spec-${r.id}`,
				sectionId: r.sectionId || "",
				title: r.title || r.content.slice(0, 60),
				description: r.title ? r.content.slice(0, 120) : undefined,
				partNumber: r.partNumber,
				pageNumber: r.pageNumber,
			}));

			setResults(transformed);
			setSelectedIndex(0);
			if (transformed.length > 0) {
				setSelectedResult(transformed[0]);
			}
		} catch (err) {
			console.error("Search failed:", err);
			setResults([]);
		} finally {
			setIsLoading(false);
		}
	}, [search, submittedSearch]);

	// Auto-search if query param provided (e.g., ?q=w:shd)
	useEffect(() => {
		if (initialQuery && !hasAutoSearched.current) {
			hasAutoSearched.current = true;
			handleSubmit();
		}
	}, [initialQuery, handleSubmit]);

	// Handle Enter key to submit
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	// Scroll selected item into view
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll when selectedIndex changes
	useEffect(() => {
		if (resultsRef.current) {
			const selected = resultsRef.current.querySelector("[data-selected='true']");
			selected?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	const handleSelectResult = useCallback((result: SpecSearchResult, index: number) => {
		setSelectedIndex(index);
		setSelectedResult(result);
	}, []);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle navigation when input is focused
			if (document.activeElement !== inputRef.current) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => {
					const newIndex = i < results.length - 1 ? i + 1 : i;
					setSelectedResult(results[newIndex]);
					return newIndex;
				});
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => {
					const newIndex = i > 0 ? i - 1 : 0;
					setSelectedResult(results[newIndex]);
					return newIndex;
				});
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [results]);

	// Handle page change from PDF viewer
	const handlePageChange = useCallback((page: number) => {
		// Could sync page changes back to state if needed
		console.log("Page changed to:", page);
	}, []);

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<Navbar sticky />

			<div className="grid min-h-0 flex-1 grid-cols-[380px_1fr]">
				{/* Search panel */}
				<div className="flex min-h-0 flex-col border-r border-[var(--color-border)]">
					{/* Search input */}
					<div className="shrink-0 p-5 pb-4">
						<textarea
							ref={inputRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="e.g. paragraph spacing, table borders, how to style text runs..."
							rows={2}
							className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-text-primary)] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.05)]"
							autoFocus
						/>
						<div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
							<span>Use natural language or element names</span>
							<span>
								<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5">
									↵
								</kbd>
							</span>
						</div>
					</div>

					{/* Results */}
					<div className="relative min-h-0 flex-1">
						<div ref={resultsRef} className="h-full overflow-y-auto">
							{/* Results count */}
							{results.length > 0 && (
								<div className="px-5 pb-2 text-xs text-[var(--color-text-muted)]">
									{results.length} results
								</div>
							)}

							{/* Empty state */}
							{!isLoading && !submittedSearch && (
								<div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
									Search the ECMA-376 specification
								</div>
							)}

							{/* No results */}
							{!isLoading && submittedSearch && results.length === 0 && (
								<div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
									No results found
								</div>
							)}

							{/* Results list */}
							{results.map((result, idx) => (
								<button
									key={result.id}
									type="button"
									data-selected={idx === selectedIndex}
									onClick={() => handleSelectResult(result, idx)}
									onMouseEnter={() => setSelectedIndex(idx)}
									className={clsx(
										"w-full cursor-pointer border-b border-[var(--color-bg-tertiary)] px-5 py-3 text-left transition",
										idx === selectedIndex
											? "bg-[var(--color-bg-tertiary)]"
											: "hover:bg-[var(--color-bg-secondary)]",
									)}
								>
									<div className="flex items-baseline gap-2">
										<span className="shrink-0 font-mono text-[11px] font-medium text-[var(--color-accent)]">
											§{result.sectionId}
										</span>
										<span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
											{result.title}
										</span>
									</div>
									{result.description && (
										<div className="mt-1 line-clamp-1 text-xs text-[var(--color-text-muted)]">
											{result.description}
										</div>
									)}
									<div className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
										Part {result.partNumber} · Page {result.pageNumber || "—"}
									</div>
								</button>
							))}
						</div>

						{/* Loading overlay */}
						{isLoading && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85">
								<Loader2 size={28} className="animate-spin text-[var(--color-accent)]" />
								<span className="text-sm text-[var(--color-text-secondary)]">Searching...</span>
							</div>
						)}
					</div>
				</div>

				{/* PDF viewer */}
				<div className="overflow-hidden">
					<PdfViewer
						partNumber={selectedResult?.partNumber ?? 1}
						pageNumber={selectedResult?.pageNumber ?? 1}
						onPageChange={handlePageChange}
					/>
				</div>
			</div>
		</div>
	);
}
