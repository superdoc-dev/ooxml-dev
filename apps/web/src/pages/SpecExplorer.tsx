import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [results, setResults] = useState<SpecSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedResult, setSelectedResult] = useState<SpecSearchResult | null>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

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

	// Debounce search input
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(search);
		}, 300);
		return () => clearTimeout(timer);
	}, [search]);

	// Search when debounced value changes
	useEffect(() => {
		if (!debouncedSearch.trim()) {
			setResults([]);
			return;
		}

		const doSearch = async () => {
			setIsLoading(true);
			try {
				const res = await fetch(`${import.meta.env.VITE_API_URL}/search`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: debouncedSearch, limit: 10 }),
				});
				const data: MCPSearchResponse = await res.json();

				const transformed: SpecSearchResult[] = data.results.map((r) => ({
					id: `spec-${r.id}`,
					sectionId: r.sectionId || "",
					title: r.title || r.content.slice(0, 60),
					description: r.title ? r.content.slice(0, 120) : undefined,
					partNumber: r.partNumber,
					pageNumber: r.pageNumber,
					pdfUrl: null,
				}));

				setResults(transformed);
				setSelectedIndex(0);
			} catch (err) {
				console.error("Search failed:", err);
				setResults([]);
			} finally {
				setIsLoading(false);
			}
		};

		doSearch();
	}, [debouncedSearch]);

	// Select first result when results change
	useEffect(() => {
		if (results.length > 0 && !selectedResult) {
			setSelectedResult(results[0]);
		}
	}, [results, selectedResult]);

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
							placeholder="Ask about the ECMA-376 spec..."
							rows={2}
							className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-text-primary)] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.05)]"
							autoFocus
						/>
						<div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
							Try natural language like "how to set paragraph margins"
						</div>
					</div>

					{/* Results */}
					<div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto">
						{/* Results count */}
						{results.length > 0 && (
							<div className="px-5 pb-2 text-xs text-[var(--color-text-muted)]">
								{results.length} results
							</div>
						)}

						{/* Loading state */}
						{isLoading && (
							<div className="flex items-center justify-center py-12">
								<Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
							</div>
						)}

						{/* Empty state */}
						{!isLoading && !search && (
							<div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
								Search the ECMA-376 specification
							</div>
						)}

						{/* No results */}
						{!isLoading && search && results.length === 0 && debouncedSearch === search && (
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
