import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";
import { SpecSearchDialog } from "../../components/SearchDialog";
import { MobileSidebar, Sidebar, useCurrentPageLabel } from "../../components/Sidebar";

export function DocsLayout() {
	const [navOpen, setNavOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const currentPageLabel = useCurrentPageLabel();

	// Keyboard shortcut for search
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setSearchOpen(true);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const openSearch = () => setSearchOpen(true);

	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar sticky onSearchClick={openSearch} />

			{/* Mobile collapsible nav */}
			<div className="border-b border-[var(--color-border)] md:hidden">
				<button
					type="button"
					onClick={() => setNavOpen(!navOpen)}
					className="flex w-full items-center justify-between px-4 py-3"
				>
					<span className="text-sm font-medium">{currentPageLabel}</span>
					<ChevronDown
						size={16}
						className={clsx(
							"text-[var(--color-text-muted)] transition-transform",
							navOpen && "rotate-180",
						)}
					/>
				</button>
				<MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />
			</div>

			<div className="flex">
				{/* Desktop Sidebar */}
				<Sidebar onSearchClick={openSearch} />

				{/* Main content */}
				<main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
					<div className="mx-auto max-w-3xl">
						<Outlet />
					</div>
				</main>
			</div>

			<Footer />

			{/* Search dialog */}
			<SpecSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
		</div>
	);
}
