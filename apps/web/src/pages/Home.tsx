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
				<div className="flex justify-center gap-4">
					<Link
						to="/docs"
						className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-white transition hover:bg-[var(--color-accent-hover)] sm:px-6 sm:py-3"
					>
						Browse Reference
					</Link>
				</div>
			</main>

			<Footer />
		</div>
	);
}
