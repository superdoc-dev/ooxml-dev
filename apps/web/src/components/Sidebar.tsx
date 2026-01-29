import { clsx } from "clsx";
import { Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const NAV_SECTIONS = [
	{
		title: "Getting Started",
		items: [{ to: "/docs", label: "Introduction", path: "index" }],
	},
	{
		title: "WordprocessingML",
		items: [
			{ to: "/docs/paragraphs", label: "Paragraphs", path: "paragraphs" },
			{ to: "/docs/tables", label: "Tables", path: "tables" },
			{ to: "/docs/styles", label: "Styles", path: "styles", disabled: true },
		],
	},
	{
		title: "Guides",
		items: [
			{ to: "/docs/creating-documents", label: "Creating Documents", path: "creating-documents" },
			{ to: "/docs/common-gotchas", label: "Common Gotchas", path: "common-gotchas" },
		],
	},
];

// Flat list for mobile nav
const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

interface SidebarProps {
	onSearchClick: () => void;
}

export function Sidebar({ onSearchClick }: SidebarProps) {
	const location = useLocation();
	const currentPath = location.pathname.replace("/docs/", "").replace("/docs", "index");

	return (
		<aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] md:flex">
			{/* Search button */}
			<div className="border-b border-[var(--color-border)] p-3">
				<button
					type="button"
					onClick={onSearchClick}
					className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition hover:border-[var(--color-text-muted)]"
				>
					<Search size={14} />
					<span className="flex-1 text-left">Search...</span>
					<kbd className="rounded bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium">
						⌘K
					</kbd>
				</button>
			</div>

			{/* Navigation */}
			<nav className="flex-1 space-y-6 overflow-y-auto p-4">
				{NAV_SECTIONS.map((section) => (
					<div key={section.title}>
						<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
							{section.title}
						</h3>
						<ul className="space-y-1">
							{section.items.map((item) => (
								<SidebarLink
									key={item.to}
									to={item.to}
									label={item.label}
									active={currentPath === item.path}
									disabled={item.disabled}
								/>
							))}
						</ul>
					</div>
				))}
			</nav>
		</aside>
	);
}

interface MobileSidebarProps {
	open: boolean;
	onClose: () => void;
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
	const location = useLocation();
	const currentPath = location.pathname.replace("/docs/", "").replace("/docs", "index");

	if (!open) return null;

	return (
		<nav className="border-t border-[var(--color-border)] px-4 py-2">
			<ul className="space-y-1">
				{NAV_ITEMS.map((item) => (
					<SidebarLink
						key={item.to}
						to={item.to}
						label={item.label}
						active={currentPath === item.path}
						disabled={item.disabled}
						onClick={onClose}
					/>
				))}
			</ul>
		</nav>
	);
}

export function useCurrentPageLabel() {
	const location = useLocation();
	const currentPath = location.pathname.replace("/docs/", "").replace("/docs", "index");
	const currentPage = NAV_ITEMS.find((item) => item.path === currentPath);
	return currentPage?.label || "Navigation";
}

function SidebarLink({
	to,
	label,
	active,
	disabled,
	onClick,
}: {
	to: string;
	label: string;
	active: boolean;
	disabled?: boolean;
	onClick?: () => void;
}) {
	if (disabled) {
		return (
			<li>
				<span className="block cursor-not-allowed rounded px-3 py-1.5 text-sm text-[var(--color-text-muted)] opacity-50">
					<span className="relative pr-8">
						{label}
						<span className="absolute -top-1 right-0 rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-accent)] opacity-100">
							soon
						</span>
					</span>
				</span>
			</li>
		);
	}

	return (
		<li>
			<Link
				to={to}
				onClick={onClick}
				className={clsx(
					"block rounded px-3 py-1.5 text-sm transition",
					active
						? "bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]"
						: "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]",
				)}
			>
				{label}
			</Link>
		</li>
	);
}
