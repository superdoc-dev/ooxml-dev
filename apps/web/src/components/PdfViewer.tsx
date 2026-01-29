import { useCallback, useEffect, useRef, useState } from "react";

// PDF URLs and page counts for each part
const PDF_CONFIG: Record<number, { url: string; totalPages: number; name: string }> = {
	1: {
		url: "https://cdn.ooxml.dev/ecma-376/part1.pdf",
		totalPages: 5560,
		name: "Fundamentals",
	},
	2: {
		url: "https://cdn.ooxml.dev/ecma-376/part2.pdf",
		totalPages: 129,
		name: "OPC",
	},
	3: {
		url: "https://cdn.ooxml.dev/ecma-376/part3.pdf",
		totalPages: 65,
		name: "Compatibility",
	},
	4: {
		url: "https://cdn.ooxml.dev/ecma-376/part4.pdf",
		totalPages: 4031,
		name: "Transitional",
	},
};

interface PdfViewerProps {
	partNumber: number;
	pageNumber: number;
	onPageChange?: (page: number) => void;
}

export function PdfViewer({ partNumber, pageNumber, onPageChange }: PdfViewerProps) {
	const config = PDF_CONFIG[partNumber] || PDF_CONFIG[1];
	const [currentPage, setCurrentPage] = useState(pageNumber);
	const [isDragging, setIsDragging] = useState(false);
	const progressRef = useRef<HTMLDivElement>(null);

	// Sync with prop changes
	useEffect(() => {
		setCurrentPage(pageNumber);
	}, [pageNumber]);

	const updatePage = useCallback(
		(newPage: number) => {
			const clamped = Math.max(1, Math.min(newPage, config.totalPages));
			setCurrentPage(clamped);
			onPageChange?.(clamped);
		},
		[config.totalPages, onPageChange],
	);

	const handlePrev = () => updatePage(currentPage - 1);
	const handleNext = () => updatePage(currentPage + 1);

	// Progress bar interaction
	const getPageFromPosition = useCallback(
		(clientX: number) => {
			if (!progressRef.current) return currentPage;
			const rect = progressRef.current.getBoundingClientRect();
			const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return Math.max(1, Math.round(ratio * config.totalPages));
		},
		[config.totalPages, currentPage],
	);

	const handleProgressClick = (e: React.MouseEvent) => {
		updatePage(getPageFromPosition(e.clientX));
	};

	const handleDragStart = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsDragging(true);
	};

	useEffect(() => {
		if (!isDragging) return;

		const handleMove = (e: MouseEvent) => {
			updatePage(getPageFromPosition(e.clientX));
		};

		const handleUp = () => {
			setIsDragging(false);
		};

		document.addEventListener("mousemove", handleMove);
		document.addEventListener("mouseup", handleUp);

		return () => {
			document.removeEventListener("mousemove", handleMove);
			document.removeEventListener("mouseup", handleUp);
		};
	}, [isDragging, getPageFromPosition, updatePage]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				setCurrentPage((p) => {
					const newPage = Math.max(1, p - 1);
					onPageChange?.(newPage);
					return newPage;
				});
			}
			if (e.key === "ArrowRight") {
				e.preventDefault();
				setCurrentPage((p) => {
					const newPage = Math.min(config.totalPages, p + 1);
					onPageChange?.(newPage);
					return newPage;
				});
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [config.totalPages, onPageChange]);

	const progressPercent = (currentPage / config.totalPages) * 100;
	const pdfUrl = `${config.url}#page=${currentPage}&toolbar=0&navpanes=0`;

	return (
		<div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
			{/* Toolbar */}
			<div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
				<div className="flex items-center justify-between px-5 py-2.5">
					{/* Part label */}
					<div className="text-sm text-[var(--color-text-secondary)]">
						<span className="font-medium text-[var(--color-text-primary)]">Part {partNumber}</span>
						<span className="mx-1.5">·</span>
						<span>{config.name}</span>
					</div>

					{/* Navigation controls */}
					<div className="flex items-center gap-4">
						<div className="flex gap-1">
							<button
								type="button"
								onClick={handlePrev}
								disabled={currentPage <= 1}
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
								aria-label="Previous page"
							>
								←
							</button>
							<button
								type="button"
								onClick={handleNext}
								disabled={currentPage >= config.totalPages}
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
								aria-label="Next page"
							>
								→
							</button>
						</div>
						<div className="flex items-baseline gap-1 text-sm">
							<span className="font-semibold text-[var(--color-text-primary)]">{currentPage}</span>
							<span className="text-[var(--color-text-muted)]">of {config.totalPages}</span>
						</div>
					</div>
				</div>

				{/* Progress bar */}
				<div
					ref={progressRef}
					onClick={handleProgressClick}
					className="group relative h-[3px] cursor-pointer bg-[var(--color-bg-tertiary)] transition-all hover:h-[5px]"
				>
					<div
						className="absolute left-0 top-0 h-full rounded-r bg-[var(--color-accent)] transition-[width] duration-200"
						style={{ width: `${progressPercent}%` }}
					/>
					<div
						onMouseDown={handleDragStart}
						className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-[var(--color-accent)] shadow-md transition-transform active:scale-110 active:cursor-grabbing group-hover:h-3.5 group-hover:w-3.5"
						style={{ left: `${progressPercent}%` }}
					/>
				</div>
			</div>

			{/* PDF iframe */}
			<div className="flex-1">
				<iframe
					key={pdfUrl}
					src={pdfUrl}
					className="h-full w-full border-0"
					title={`ECMA-376 Part ${partNumber} - Page ${currentPage}`}
				/>
			</div>
		</div>
	);
}
