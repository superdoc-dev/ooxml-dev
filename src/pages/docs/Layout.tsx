import { clsx } from "clsx";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";

export function DocsLayout() {
	const location = useLocation();
	const currentPath = location.pathname.replace("/docs/", "").replace("/docs", "index");

	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar sticky />

			<div className="flex">
				{/* Sidebar */}
				<aside className="sticky top-[57px] h-[calc(100vh-57px)] w-64 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
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
				<main className="flex-1 px-8 py-8">
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
}: {
	to: string;
	label: string;
	active: boolean;
	disabled?: boolean;
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
