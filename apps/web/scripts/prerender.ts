/**
 * Build-time pre-rendering script.
 *
 * Runs after `vite build` to generate static HTML for each route.
 * This makes doc pages crawlable by search engines without SSR.
 *
 * Usage: bun apps/web/scripts/prerender.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type DocPage, docs } from "../src/data/docs";
import { getAllPaths, getSeoMeta } from "../src/data/seo";

const DIST = resolve(import.meta.dir, "../dist");
const SITE_URL = "https://ooxml.dev";

// Read the built index.html as template
const template = readFileSync(resolve(DIST, "index.html"), "utf-8");

// --- Content block → HTML converters ---

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function inlineMarkdownToHtml(text: string): string {
	return text
		.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			(_, linkText, url) => `<a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a>`,
		)
		.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
}

function contentBlockToHtml(block: DocPage["content"][number]): string {
	switch (block.type) {
		case "heading": {
			const tag = `h${block.level}`;
			return `<${tag}>${escapeHtml(block.text)}</${tag}>`;
		}
		case "paragraph":
			return `<p>${inlineMarkdownToHtml(block.text)}</p>`;
		case "code":
			return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
		case "preview":
			return `<pre><code>${escapeHtml(block.xml)}</code></pre>`;
		case "note":
			return `<div><strong>${escapeHtml(block.title)}</strong>${block.app ? ` <em>(${escapeHtml(block.app)})</em>` : ""}<p>${inlineMarkdownToHtml(block.text)}</p></div>`;
		case "table":
			return `<table><thead><tr>${block.headers.map((h) => `<th>${inlineMarkdownToHtml(h)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdownToHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
		default:
			return "";
	}
}

function docPageToHtml(page: DocPage): string {
	const parts: string[] = [];
	parts.push(`<article>`);
	if (page.badge) {
		parts.push(`<span>${escapeHtml(page.badge)}</span>`);
	}
	parts.push(`<h1>${escapeHtml(page.title)}</h1>`);
	if (page.description) {
		parts.push(`<p>${escapeHtml(page.description)}</p>`);
	}
	for (const block of page.content) {
		parts.push(contentBlockToHtml(block));
	}
	parts.push(`</article>`);
	return parts.join("\n");
}

// --- Static HTML for non-doc pages ---

function homePageHtml(): string {
	return `<main>
<h1>ooxml.dev</h1>
<p>The OOXML spec, explained by people who actually implemented it.</p>
<p>Interactive examples, real-world gotchas, live previews, and AI-powered search.</p>
<a href="/docs">Browse Reference</a>
</main>`;
}

function mcpPageHtml(): string {
	return `<main>
<h1>Search the ECMA-376 spec with AI</h1>
<p>Connect your MCP-compatible client to search 18,000+ specification chunks using natural language queries.</p>
<h2>Available Tools</h2>
<ul>
<li><strong>search_ecma_spec</strong> — Semantic search across the specification.</li>
<li><strong>get_section</strong> — Retrieve a specific section by ID.</li>
<li><strong>list_parts</strong> — Browse the specification structure.</li>
</ul>
<h2>What is MCP?</h2>
<p>The Model Context Protocol (MCP) is an open standard that lets AI assistants connect to external data sources and tools.</p>
</main>`;
}

function specPageHtml(): string {
	return `<main>
<h1>ECMA-376 Spec Explorer</h1>
<p>Search and browse the ECMA-376 Office Open XML specification with semantic search and PDF viewer.</p>
</main>`;
}

// --- Meta tags and JSON-LD ---

function buildHead(path: string): string {
	const seo = getSeoMeta(path);
	// Cloudflare Pages adds trailing slashes via 308 redirect, so canonical must match
	const canonicalPath = path === "/" ? path : `${path}/`;
	const url = `${SITE_URL}${canonicalPath}`;

	const meta = [
		`<title>${escapeHtml(seo.title)}</title>`,
		`<meta name="description" content="${escapeHtml(seo.description)}"/>`,
		`<link rel="canonical" href="${url}"/>`,
		`<meta property="og:title" content="${escapeHtml(seo.title)}"/>`,
		`<meta property="og:description" content="${escapeHtml(seo.description)}"/>`,
		`<meta property="og:url" content="${url}"/>`,
		`<meta property="og:type" content="${seo.type}"/>`,
		`<meta property="og:site_name" content="ooxml.dev"/>`,
		`<meta name="twitter:card" content="summary"/>`,
		`<meta name="twitter:title" content="${escapeHtml(seo.title)}"/>`,
		`<meta name="twitter:description" content="${escapeHtml(seo.description)}"/>`,
	];

	// JSON-LD structured data
	if (seo.type === "article") {
		const jsonLd = {
			"@context": "https://schema.org",
			"@type": "TechArticle",
			headline: seo.title.split(" | ")[0].split(" — ")[0],
			description: seo.description,
			url,
			author: { "@type": "Organization", name: "SuperDoc", url: "https://superdoc.dev" },
			publisher: { "@type": "Organization", name: "ooxml.dev" },
			about: {
				"@type": "Thing",
				name: "Office Open XML",
				sameAs: "https://en.wikipedia.org/wiki/Office_Open_XML",
			},
		};
		meta.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
	} else if (path === "/") {
		const jsonLd = {
			"@context": "https://schema.org",
			"@type": "WebSite",
			name: "ooxml.dev",
			url: SITE_URL,
			description: seo.description,
			potentialAction: {
				"@type": "SearchAction",
				target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/spec?q={search_term}` },
				"query-input": "required name=search_term",
			},
		};
		meta.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
	}

	return meta.join("\n    ");
}

// --- Generate HTML for a given path ---

function getContentHtml(path: string): string {
	if (path === "/") return homePageHtml();
	if (path === "/mcp") return mcpPageHtml();
	if (path === "/spec") return specPageHtml();

	// Doc pages
	const slug = path === "/docs" ? "index" : path.replace("/docs/", "");
	const page = docs[slug];
	if (page) return docPageToHtml(page);

	return "";
}

function renderPage(path: string): string {
	const headTags = buildHead(path);
	const content = getContentHtml(path);

	let html = template;

	// Replace <title> tag
	html = html.replace(
		/<title>[^<]*<\/title>/,
		headTags.split("\n")[0], // title tag
	);

	// Inject remaining meta tags before </head>
	const remainingMeta = headTags.split("\n").slice(1).join("\n    ");
	html = html.replace("</head>", `    ${remainingMeta}\n  </head>`);

	// Inject content into <div id="root">
	html = html.replace('<div id="root"></div>', `<div id="root">${content}</div>`);

	return html;
}

// --- Sitemap generation ---

function generateSitemap(paths: string[]): string {
	const urls = paths.map((path) => {
		const priority = path === "/" ? "1.0" : path.startsWith("/docs/") ? "0.8" : "0.7";
		const changefreq = path === "/" ? "weekly" : "monthly";
		const loc = path === "/" ? SITE_URL + path : `${SITE_URL}${path}/`;
		return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
	});

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

// --- Main ---

const paths = getAllPaths();
let count = 0;

for (const path of paths) {
	const html = renderPage(path);
	const filePath =
		path === "/" ? resolve(DIST, "index.html") : resolve(DIST, `${path.slice(1)}/index.html`);

	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, html);
	count++;
	console.log(`  ✓ ${path}`);
}

// Generate sitemap
const sitemap = generateSitemap(paths);
writeFileSync(resolve(DIST, "sitemap.xml"), sitemap);
console.log(`  ✓ /sitemap.xml`);

console.log(`\nPre-rendered ${count} pages + sitemap.`);
