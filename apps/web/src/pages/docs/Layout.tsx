import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";

const NAV_ITEMS = [
	{ to: "/docs", label: "Introduction", path: "index" },
	{ to: "/docs/paragraphs", label: "Paragraphs", path: "paragraphs" },
	{ to: "/docs/tables", label: "Tables", path: "tables" },
	{ to: "/docs/styles", label: "Styles", path: "styles", disabled: true },
	{ to: "/docs/creating-documents", label: "Creating Documents", path: "creating-documents" },
	{ to: "/docs/common-gotchas", label: "Common Gotchas", path: "common-gotchas" },
];

export function DocsLayout() {
	const location = useLocation();
	const currentPath = location.pathname.replace("/docs/", "").replace("/docs", "index");
	const [navOpen, setNavOpen] = useState(false);

	const currentPage = NAV_ITEMS.find((item) => item.path === currentPath);

	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar sticky />

			{/* Mobile collapsible nav */}
			<div className="border-b border-[var(--color-border)] md:hidden">
				<button
					type="button"
					onClick={() => setNavOpen(!navOpen)}
					className="flex w-full items-center justify-between px-4 py-3"
				>
					<span className="text-sm font-medium">{currentPage?.label || "Navigation"}</span>
					<ChevronDown
						size={16}
						className={clsx(
							"text-[var(--color-text-muted)] transition-transform",
							navOpen && "rotate-180",
						)}
					/>
				</button>
				{navOpen && (
					<nav className="border-t border-[var(--color-border)] px-4 py-2">
						<ul className="space-y-1">
							{NAV_ITEMS.map((item) => (
								<SidebarLink
									key={item.to}
									to={item.to}
									label={item.label}
									active={currentPath === item.path}
									disabled={item.disabled}
									onClick={() => setNavOpen(false)}
								/>
							))}
						</ul>
					</nav>
				)}
			</div>

			<div className="flex">
				{/* Desktop Sidebar */}
				<aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-64 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 md:block">
					<nav className="space-y-6">
						{/* Getting Started */}
						<div>
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
								Getting Started
							</h3>
							<ul className="space-y-1">
								<SidebarLink to="/docs" label="Introduction" active={currentPath === "index"} />
							</ul>
						</div>

						{/* WordprocessingML */}
						<div>
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
								WordprocessingML
							</h3>
							<ul className="space-y-1">
								<SidebarLink
									to="/docs/paragraphs"
									label="Paragraphs"
									active={currentPath === "paragraphs"}
								/>
								<SidebarLink to="/docs/tables" label="Tables" active={currentPath === "tables"} />
								<SidebarLink
									to="/docs/styles"
									label="Styles"
									active={currentPath === "styles"}
									disabled
								/>
							</ul>
						</div>

						{/* Guides */}
						<div>
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
								Guides
							</h3>
							<ul className="space-y-1">
								<SidebarLink
									to="/docs/creating-documents"
									label="Creating Documents"
									active={currentPath === "creating-documents"}
								/>
								<SidebarLink
									to="/docs/common-gotchas"
									label="Common Gotchas"
									active={currentPath === "common-gotchas"}
								/>
							</ul>
						</div>
					</nav>
				</aside>

				{/* Main content */}
				<main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
					<div className="mx-auto max-w-3xl">
						<Outlet />
					</div>
				</main>
			</div>

			<Footer />
		</div>
	);
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
				<span className="block rounded px-3 py-1.5 text-sm cursor-not-allowed text-[var(--color-text-muted)] opacity-50">
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
