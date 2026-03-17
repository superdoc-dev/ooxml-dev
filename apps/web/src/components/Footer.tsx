export function Footer() {
	return (
		<footer className="border-t border-[var(--color-border)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
			Built by 🦋{" "}
			<a
				href="https://superdoc.dev/?utm_source=ooxml.dev&utm_medium=referral&utm_campaign=footer"
				className="text-[var(--color-accent)] hover:underline"
			>
				SuperDoc
			</a>
		</footer>
	);
}
