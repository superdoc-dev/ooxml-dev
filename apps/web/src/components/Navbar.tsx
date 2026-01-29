import { clsx } from "clsx";
import { Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

interface NavbarProps {
	sticky?: boolean;
	maxWidth?: boolean;
	onSearchClick?: () => void;
}

export function Navbar({ sticky = false, maxWidth = false, onSearchClick }: NavbarProps) {
	const location = useLocation();
	const isDocsActive = location.pathname.startsWith("/docs");
	const isSpecActive = location.pathname === "/spec";
	const isMcpActive = location.pathname === "/mcp";
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	return (
		<header
			className={clsx(
				"border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 sm:px-6",
				sticky && "sticky top-0 z-50",
			)}
		>
			<div className={clsx("flex items-center justify-between", maxWidth && "mx-auto max-w-6xl")}>
				<Link to="/" className="flex shrink-0 items-center">
					<img src={logo} alt="ooxml.dev" className="h-6" />
				</Link>

				{/* Desktop navigation */}
				<nav className="hidden items-center gap-4 sm:flex">
					<NavLink to="/docs" active={isDocsActive}>
						Reference
					</NavLink>
					<NavLink to="/spec" active={isSpecActive}>
						Spec
					</NavLink>
					<div className="flex items-center gap-1">
						<NavLink to="/mcp" active={isMcpActive}>
							MCP
						</NavLink>
						<span className="rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-accent)]">
							new
						</span>
					</div>
					<div className="flex items-center gap-1">
						<NavLink to="#" active={false} disabled>
							Playground
						</NavLink>
						<span className="rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-accent)] opacity-50">
							soon
						</span>
					</div>
				</nav>

				{/* Mobile buttons */}
				<div className="flex items-center gap-1 sm:hidden">
					{onSearchClick && (
						<button
							type="button"
							onClick={onSearchClick}
							className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
							aria-label="Search"
						>
							<Search size={20} />
						</button>
					)}
					<button
						type="button"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
						aria-label="Toggle menu"
					>
						{mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
					</button>
				</div>
			</div>

			{/* Mobile menu */}
			{mobileMenuOpen && (
				<nav className="mt-3 flex flex-col gap-1 border-t border-[var(--color-border)] pt-3 sm:hidden">
					<NavLink to="/docs" active={isDocsActive} onClick={() => setMobileMenuOpen(false)}>
						Reference
					</NavLink>
					<NavLink to="/spec" active={isSpecActive} onClick={() => setMobileMenuOpen(false)}>
						Spec
					</NavLink>
					<div className="flex items-center gap-1">
						<NavLink to="/mcp" active={isMcpActive} onClick={() => setMobileMenuOpen(false)}>
							MCP
						</NavLink>
						<span className="rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-accent)]">
							new
						</span>
					</div>
					<div className="flex items-center gap-1">
						<NavLink to="#" active={false} disabled>
							Playground
						</NavLink>
						<span className="rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-accent)] opacity-50">
							soon
						</span>
					</div>
				</nav>
			)}
		</header>
	);
}

function NavLink({
	to,
	active,
	disabled,
	children,
	onClick,
}: {
	to: string;
	active: boolean;
	disabled?: boolean;
	children: React.ReactNode;
	onClick?: () => void;
}) {
	const className = clsx(
		"rounded px-3 py-1.5 text-sm transition",
		disabled
			? "cursor-not-allowed text-[var(--color-text-muted)] opacity-50"
			: active
				? "font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10"
				: "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
	);

	if (disabled) {
		return <span className={className}>{children}</span>;
	}

	if (to.startsWith("#")) {
		return (
			<a href={to} className={className}>
				{children}
			</a>
		);
	}

	return (
		<Link to={to} className={className} onClick={onClick}>
			{children}
		</Link>
	);
}
