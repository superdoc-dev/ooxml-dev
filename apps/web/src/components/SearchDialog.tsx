import { clsx } from "clsx";
import { FileText, Hash, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { docs } from "../data/docs";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

// Local docs search result
interface LocalSearchResult {
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

export function SpecSearchDialog({ open, onOpenChange }: Props) {
	const [search, setSearch] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const resultsRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	// Build local index once
	const localIndex = useMemo(() => buildLocalIndex(), []);

	// Local search (instant)
	const results = useMemo((): LocalSearchResult[] => {
		if (!search.trim()) return [];

		const query = search.toLowerCase();
		const matches = localIndex.filter((item) => item.content.includes(query));

		return matches.slice(0, 8).map((item) => ({
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

	// Reset when dialog closes
	useEffect(() => {
		if (!open) {
			setSearch("");
			setSelectedIndex(0);
		}
	}, [open]);

	// Reset selection when search changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when search changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [search]);

	// Scroll selected item into view
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scroll when selectedIndex changes
	useEffect(() => {
		if (resultsRef.current) {
			const selected = resultsRef.current.querySelector("[data-selected='true']");
			selected?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onOpenChange(false);
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i < results.length - 1 ? i + 1 : i));
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
			}
			if (e.key === "Enter" && results.length > 0) {
				e.preventDefault();
				const result = results[selectedIndex];
				if (result) {
					onOpenChange(false);
					navigate(result.url);
				}
			}
		};
		if (open) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
	}, [open, onOpenChange, results, selectedIndex, navigate]);

	if (!open) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
				onClick={() => onOpenChange(false)}
			/>

			{/* Dialog */}
			<div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
				<div className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl">
					{/* Search input */}
					<div className="relative border-b border-[var(--color-border)]">
						<Search
							size={18}
							className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
						/>
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search documentation..."
							className="w-full bg-transparent py-4 pl-12 pr-4 text-base outline-none placeholder:text-[var(--color-text-muted)]"
							autoFocus
						/>
					</div>

					{/* Results */}
					<div ref={resultsRef} className="max-h-80 overflow-y-auto">
						{/* Empty state */}
						{!search && (
							<div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
								Type to search...
							</div>
						)}

						{/* Results list */}
						{search &&
							(results.length > 0 ? (
								results.map((result, idx) => (
									<Link
										key={result.id}
										to={result.url}
										onClick={() => onOpenChange(false)}
										data-selected={idx === selectedIndex}
										onMouseEnter={() => setSelectedIndex(idx)}
										className={clsx(
											"flex items-start gap-3 px-4 py-3 border-b border-[var(--color-border)] transition",
											idx === selectedIndex
												? "bg-[var(--color-bg-secondary)]"
												: "hover:bg-[var(--color-bg-secondary)]",
										)}
									>
										<span className="mt-0.5 text-[var(--color-text-muted)]">
											{result.type === "page" ? <FileText size={18} /> : <Hash size={18} />}
										</span>
										<div className="min-w-0 flex-1">
											<div className="font-medium text-[var(--color-text-primary)]">
												{result.content}
											</div>
											{result.breadcrumbs && (
												<div className="text-sm text-[var(--color-text-muted)] truncate">
													{result.breadcrumbs.join(" › ")}
												</div>
											)}
										</div>
									</Link>
								))
							) : (
								<div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
									No results found
								</div>
							))}
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
						<div className="flex items-center gap-3">
							<span>
								<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 py-0.5">
									↑↓
								</kbd>{" "}
								navigate
							</span>
							<span>
								<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 py-0.5">
									↵
								</kbd>{" "}
								open
							</span>
						</div>
						<span>
							<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 py-0.5">
								esc
							</kbd>
						</span>
					</div>
				</div>
			</div>
		</>
	);
}
