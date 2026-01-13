import { clsx } from "clsx";
import { Link, useLocation } from "react-router-dom";
import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";
import { useTheme } from "../hooks/useTheme";
import { ThemeToggle } from "./ThemeToggle";

interface NavbarProps {
	sticky?: boolean;
	maxWidth?: boolean;
}

export function Navbar({ sticky = false, maxWidth = false }: NavbarProps) {
	const location = useLocation();
	const { resolvedTheme } = useTheme();
	const isDocsActive = location.pathname.startsWith("/docs");

	return (
		<header
			className={clsx(
				"border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-3",
				sticky && "sticky top-0 z-50",
			)}
		>
			<div className={clsx("flex items-center justify-between", maxWidth && "mx-auto max-w-6xl")}>
				<Link to="/" className="flex items-center">
					<img
						src={resolvedTheme === "dark" ? logoDark : logoLight}
						alt="ooxml.dev"
						className="h-6"
					/>
				</Link>
				<nav className="flex items-center gap-4">
					<NavLink to="/docs" active={isDocsActive}>
						Reference
					</NavLink>
					<NavLink to="#" active={false} disabled>
						<span className="relative pr-6">
							Playground
							<span className="absolute -top-2 -right-1 rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-accent)]">
								soon
							</span>
						</span>
					</NavLink>
					<ThemeToggle />
				</nav>
			</div>
		</header>
	);
}

function NavLink({
	to,
	active,
	disabled,
	children,
}: {
	to: string;
	active: boolean;
	disabled?: boolean;
	children: React.ReactNode;
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
		<Link to={to} className={className}>
			{children}
		</Link>
	);
}
