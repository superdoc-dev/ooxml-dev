import { Link } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function NotFound() {
	useDocumentTitle("Page Not Found | ooxml.dev");

	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar maxWidth />

			<main className="mx-auto max-w-xl px-4 py-24 text-center">
				<h1 className="mb-4 text-3xl font-bold">404 — Page Not Found</h1>
				<p className="mb-8 text-[var(--color-text-secondary)]">
					The page you're looking for doesn't exist or has been moved.
				</p>
				<div className="flex justify-center gap-4">
					<Link
						to="/"
						className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
					>
						Go to Homepage
					</Link>
					<Link
						to="/docs"
						className="rounded-lg border border-[var(--color-border)] px-5 py-2.5 font-medium text-[var(--color-text-primary)] transition hover:bg-[var(--color-bg-secondary)]"
					>
						Browse Docs
					</Link>
				</div>
			</main>

			<Footer />
		</div>
	);
}
