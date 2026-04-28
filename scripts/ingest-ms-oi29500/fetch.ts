/**
 * Fetch the MS-OI29500 toc.json + per-page native markdown into a local
 * cache directory. Re-runs are no-ops on cached pages unless `--refresh` is
 * passed. Produces a list of `{ guid, tocTitle, contentPath }` for downstream
 * parsing/ingest.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const TOC_URL =
	"https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/toc.json";
export const PAGE_URL = (guid: string) =>
	`https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/${guid}?accept=text/markdown`;
export const CACHE_DIR = "data/ms-oi29500-cache";
const FETCH_DELAY_MS = 200;
const STALE_AFTER_DAYS = 7;

interface TocEntry {
	href?: string;
	toc_title?: string;
	children?: TocEntry[];
	items?: TocEntry[];
}

export interface TocPage {
	href: string;
	tocTitle: string;
}

export function flattenToc(items: TocEntry[]): TocPage[] {
	const out: TocPage[] = [];
	const walk = (entries: TocEntry[]) => {
		for (const e of entries) {
			const href = e.href ?? "";
			const title = e.toc_title ?? "";
			if (href && !href.startsWith("/") && !href.startsWith("http")) {
				out.push({ href, tocTitle: title });
			}
			if (e.children) walk(e.children);
			if (e.items) walk(e.items);
		}
	};
	walk(items);
	return out;
}

/** Filter to actual implementation note pages (`2.x.x` titles). */
export function filterImplementationNotes(pages: TocPage[]): TocPage[] {
	return pages.filter((p) => /^2\.\d+\.\d+\s/.test(p.tocTitle));
}

async function fetchCached(url: string, cachePath: string, refresh: boolean): Promise<string> {
	if (!refresh && existsSync(cachePath)) {
		const ageMs = Date.now() - statSync(cachePath).mtimeMs;
		if (ageMs < STALE_AFTER_DAYS * 86400_000) return readFileSync(cachePath, "utf8");
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
	const body = await res.text();
	writeFileSync(cachePath, body);
	await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
	return body;
}

export async function fetchToc(refresh = false): Promise<TocPage[]> {
	mkdirSync(CACHE_DIR, { recursive: true });
	const tocPath = join(CACHE_DIR, "toc.json");
	const tocText = await fetchCached(TOC_URL, tocPath, refresh);
	const toc = JSON.parse(tocText) as { items: TocEntry[] };
	return flattenToc(toc.items);
}

export async function fetchPage(
	page: TocPage,
	opts: { refresh?: boolean; verbose?: boolean } = {},
): Promise<{ guid: string; tocTitle: string; content: string; cachePath: string }> {
	const cachePath = join(CACHE_DIR, `${page.href}.md`);
	const content = await fetchCached(PAGE_URL(page.href), cachePath, opts.refresh ?? false);
	if (opts.verbose) console.log(`  fetched ${page.href} (${content.length} bytes)`);
	return { guid: page.href, tocTitle: page.tocTitle, content, cachePath };
}
