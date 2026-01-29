import { clsx } from "clsx";
import { ExternalLink, FileText, Hash, Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSpecSearch } from "../hooks/useSpecSearch";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type Tab = "docs" | "spec";

export function SpecSearchDialog({ open, onOpenChange }: Props) {
	const [activeTab, setActiveTab] = useState<Tab>("docs");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const resultsRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();
	const {
		search,
		setSearch,
		localResults,
		specResults,
		isLoading,
		specSearchTriggered,
		doSpecSearch,
		resetSearch,
	} = useSpecSearch();

	// Get current results based on active tab
	const currentResults = activeTab === "docs" ? localResults : specResults;
	const resultsCount = currentResults.length;

	// Reset when dialog closes
	useEffect(() => {
		if (!open) {
			resetSearch();
			setActiveTab("docs");
			setSelectedIndex(0);
		}
	}, [open, resetSearch]);

	// Reset selection when search or tab changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when search/activeTab change
	useEffect(() => {
		setSelectedIndex(0);
	}, [search, activeTab]);

	// Trigger spec search when switching to spec tab with a query
	useEffect(() => {
		if (activeTab === "spec" && search.trim() && !specSearchTriggered) {
			doSpecSearch(search);
		}
	}, [activeTab, search, specSearchTriggered, doSpecSearch]);

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
			if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				setActiveTab((t) => (t === "docs" ? "spec" : "docs"));
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i < resultsCount - 1 ? i + 1 : i));
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
			}
			if (e.key === "Enter" && resultsCount > 0) {
				e.preventDefault();
				const result = currentResults[selectedIndex];
				if (result) {
					onOpenChange(false);
					if (activeTab === "docs") {
						navigate((result as (typeof localResults)[number]).url);
					} else {
						const specResult = result as (typeof specResults)[number];
						if (specResult.pdfUrl) {
							window.open(specResult.pdfUrl, "_blank");
						}
					}
				}
			}
		};
		if (open) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
	}, [open, onOpenChange, resultsCount, selectedIndex, currentResults, activeTab, navigate]);

	if (!open) return null;

	const hasLocalResults = localResults.length > 0;
	const hasSpecResults = specResults.length > 0;

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

					{/* Tabs */}
					<div className="flex border-b border-[var(--color-border)]">
						<button
							type="button"
							onClick={() => setActiveTab("docs")}
							className={clsx(
								"flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
								activeTab === "docs"
									? "text-[var(--color-accent)] border-[var(--color-accent)]"
									: "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]",
							)}
						>
							Docs
							{hasLocalResults && (
								<span className="ml-1.5 text-xs opacity-70">{localResults.length}</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("spec")}
							className={clsx(
								"flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
								activeTab === "spec"
									? "text-[var(--color-accent)] border-[var(--color-accent)]"
									: "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]",
							)}
						>
							ECMA-376
							{hasSpecResults && (
								<span className="ml-1.5 text-xs opacity-70">{specResults.length}</span>
							)}
							{isLoading && activeTab === "spec" && (
								<Loader2 size={12} className="ml-1.5 inline animate-spin" />
							)}
						</button>
					</div>

					{/* Results */}
					<div ref={resultsRef} className="max-h-80 overflow-y-auto">
						{/* Empty state */}
						{!search && (
							<div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
								Type to search...
							</div>
						)}

						{/* Docs tab content */}
						{activeTab === "docs" &&
							search &&
							(hasLocalResults ? (
								localResults.map((result, idx) => (
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
									No results in docs
								</div>
							))}

						{/* Spec tab content */}
						{activeTab === "spec" && search && (
							<>
								{isLoading && !hasSpecResults && (
									<div className="p-6 text-center">
										<Loader2
											size={24}
											className="mx-auto animate-spin text-[var(--color-text-muted)]"
										/>
										<div className="mt-2 text-sm text-[var(--color-text-muted)]">
											Searching ECMA-376 spec...
										</div>
									</div>
								)}

								{hasSpecResults &&
									specResults.map((result, idx) => (
										<a
											key={result.id}
											href={result.pdfUrl || "#"}
											target="_blank"
											rel="noopener noreferrer"
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
											<span className="text-sm text-[var(--color-text-muted)] font-mono w-20 flex-shrink-0">
												§ {result.sectionId}
											</span>
											<div className="min-w-0 flex-1">
												<div className="font-medium text-[var(--color-text-primary)]">
													{result.title}
												</div>
												{result.description && (
													<div className="text-sm text-[var(--color-text-muted)] truncate">
														{result.description}
													</div>
												)}
											</div>
											<div className="flex items-center gap-2 flex-shrink-0">
												{result.pageNumber && (
													<span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded">
														Page {result.pageNumber}
													</span>
												)}
												<ExternalLink size={14} className="text-[var(--color-text-muted)]" />
											</div>
										</a>
									))}

								{!isLoading && !hasSpecResults && specSearchTriggered && (
									<div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
										No results in ECMA-376 spec
									</div>
								)}
							</>
						)}
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
						<div className="flex items-center gap-3">
							<span>
								<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 py-0.5">
									Tab
								</kbd>{" "}
								switch
							</span>
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
