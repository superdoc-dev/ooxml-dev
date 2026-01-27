import { useLocation } from "react-router-dom";
import { ImplementationNote } from "@/components/ImplementationNote";
import { SuperDocPreview } from "@/components/SuperDocPreview";
import { type DocPage, docs } from "@/data/docs";

interface DocsPageProps {
	slug?: string;
}

export function DocsPage({ slug: propSlug }: DocsPageProps) {
	const location = useLocation();
	const slug =
		propSlug || location.pathname.replace("/docs/", "").replace("/docs", "index") || "index";

	const page = docs[slug as keyof typeof docs];

	if (!page) {
		return (
			<div className="py-12 text-center">
				<h1 className="mb-4 text-2xl font-bold">Page Not Found</h1>
				<p className="text-[var(--color-text-secondary)]">The page "{slug}" doesn't exist yet.</p>
			</div>
		);
	}

	return (
		<article>
			{/* Header */}
			{page.badge && (
				<span className="mb-2 inline-block rounded bg-[var(--color-accent)]/10 px-2 py-1 font-mono text-xs font-medium text-[var(--color-accent)]">
					{page.badge}
				</span>
			)}
			<h1 className="mb-4 text-3xl font-bold">{page.title}</h1>
			{page.description && (
				<p className="mb-8 text-lg text-[var(--color-text-secondary)]">{page.description}</p>
			)}

			{/* Content */}
			<div className="prose max-w-none">
				{page.content.map((block, i) => (
					<ContentBlock key={i} block={block} />
				))}
			</div>
		</article>
	);
}

function ContentBlock({ block }: { block: DocPage["content"][number] }) {
	switch (block.type) {
		case "heading":
			const HeadingTag = `h${block.level}` as "h2" | "h3" | "h4";
			return (
				<HeadingTag
					className={
						block.level === 2
							? "mb-4 mt-10 text-xl font-semibold"
							: "mb-3 mt-6 text-lg font-semibold"
					}
				>
					{block.text}
				</HeadingTag>
			);

		case "paragraph":
			return (
				<p className="mb-4 text-[var(--color-text-secondary)]">
					<InlineMarkdown text={block.text} />
				</p>
			);

		case "code":
			return (
				<pre className="mb-6 overflow-x-auto rounded-lg bg-zinc-900 p-4">
					<code className="text-sm text-zinc-300">{block.code}</code>
				</pre>
			);

		case "preview":
			return <SuperDocPreview xml={block.xml} title={block.title} />;

		case "note":
			return (
				<ImplementationNote type={block.noteType} title={block.title} app={block.app}>
					<InlineMarkdown text={block.text} />
				</ImplementationNote>
			);

		case "table":
			return (
				<div className="mb-6 overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr>
								{block.headers.map((header, i) => (
									<th
										key={i}
										className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-left font-semibold"
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{block.rows.map((row, i) => (
								<tr key={i}>
									{row.map((cell, j) => (
										<td key={j} className="border border-[var(--color-border)] px-4 py-2">
											{cell}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);

		default:
			return null;
	}
}

function InlineMarkdown({ text }: { text: string }) {
	// Parse [text](url) markdown links and `code` inline code
	const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g);

	return (
		<>
			{parts.map((part, i) => {
				// Check for links
				const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
				if (linkMatch) {
					const [, linkText, url] = linkMatch;
					return (
						<a
							key={i}
							href={url}
							className="text-[var(--color-accent)] hover:underline"
							target={url.startsWith("http") ? "_blank" : undefined}
							rel={url.startsWith("http") ? "noopener noreferrer" : undefined}
						>
							{linkText}
						</a>
					);
				}
				// Check for inline code
				const codeMatch = part.match(/^`([^`]+)`$/);
				if (codeMatch) {
					return (
						<code
							key={i}
							className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-sm text-[var(--color-accent)]"
						>
							{codeMatch[1]}
						</code>
					);
				}
				return <span key={i}>{part}</span>;
			})}
		</>
	);
}
