import { Link } from "react-router-dom";
import { Footer } from "../components/Footer";
import { Navbar } from "../components/Navbar";

export function Home() {
	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar maxWidth />

			{/* Hero */}
			<main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
				<p className="mb-4 text-sm font-medium text-[var(--color-accent)]">ECMA-376 / ISO 29500</p>
				<h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl">ooxml.dev</h1>
				<p className="mb-8 text-lg text-[var(--color-text-secondary)] sm:text-xl">
					The OOXML spec, explained by people who actually implemented it.
					<br className="hidden sm:block" />
					<span className="sm:hidden"> </span>
					Interactive examples, real-world gotchas, live previews, and AI-powered search.
				</p>
				<div className="flex justify-center gap-4 mb-6">
					<Link
						to="/docs"
						className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-white transition hover:bg-[var(--color-accent-hover)] sm:px-6 sm:py-3"
					>
						Browse Reference
					</Link>
				</div>

				{/* MCP Callout */}
				<div className="flex items-center justify-center gap-2 text-sm">
					<span className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px] font-medium px-1.5 py-0.5 rounded">
						NEW
					</span>
					<span className="text-[var(--color-text-secondary)]">Search the spec via MCP</span>
					<Link to="/mcp" className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium text-xs">
						Learn more →
					</Link>
				</div>
			</main>

			<Footer />
		</div>
	);
}
