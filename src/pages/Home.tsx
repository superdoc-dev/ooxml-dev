import { Link } from "react-router-dom";
import { Footer } from "../components/Footer";
import { Navbar } from "../components/Navbar";

export function Home() {
	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar maxWidth />

			{/* Hero */}
			<main className="mx-auto max-w-4xl px-6 py-24 text-center">
				<p className="mb-4 text-sm font-medium text-[var(--color-accent)]">ECMA-376 / ISO 29500</p>
				<h1 className="mb-6 text-5xl font-bold tracking-tight">ooxml.dev</h1>
				<p className="mb-8 text-xl text-[var(--color-text-secondary)]">
					The OOXML spec, explained by people who actually implemented it.
					<br />
					Interactive examples, real-world gotchas, and live previews.
				</p>
				<div className="flex justify-center gap-4">
					<Link
						to="/docs"
						className="rounded-lg bg-[var(--color-accent)] px-6 py-3 font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
					>
						Browse Reference
					</Link>
					{/* <a
            href="#"
            className="rounded-lg border border-[var(--color-border)] px-6 py-3 font-medium transition hover:bg-[var(--color-bg-secondary)]"
          >
            Open Playground
          </a> */}
				</div>
			</main>

			<Footer />
		</div>
	);
}
