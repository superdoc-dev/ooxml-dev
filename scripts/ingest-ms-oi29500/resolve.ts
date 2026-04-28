/**
 * Phase 2 symbol resolver.
 *
 * Maps an MS-OI29500 entry's `(name, ecma_section)` to a row in `xsd_symbols`
 * for the `transitional` profile.
 *
 * Conservative: when multiple plausible candidates exist with no clear way to
 * pick (ambiguous kind/vocab), the resolver returns `resolved: false` with a
 * `targetRef` rather than guessing. Wrong attachment is worse than no
 * attachment.
 */

import type { Sql } from "postgres";

export interface SymbolRow {
	id: number;
	vocabulary_id: string;
	local_name: string;
	kind: string;
	parent_symbol_id: number | null;
}

export interface SymbolMap {
	/** All transitional symbols. Source of truth; lookups derive from this. */
	all: SymbolRow[];
	/** (vocabulary_id, local_name) → rows. */
	byVocabAndName: Map<string, SymbolRow[]>;
}

export type ResolutionOutcome =
	| {
			resolved: true;
			symbolId: number;
			symbolKind: string;
			vocabulary: string;
			confidence: "high" | "medium";
			/** True when the matched symbol is a local element decl
			 *  (parent_symbol_id is set). The current MCP `ooxml_element`
			 *  lookup filters to top-level only, so local matches are reachable
			 *  only through `ooxml_behavior`. Ingest still attaches the
			 *  behavior note via symbol_id so the dedicated tool can surface
			 *  it; the inline tool will silently skip it. */
			isLocal: boolean;
	  }
	| {
			resolved: false;
			reason: "no-vocabulary" | "no-match" | "ambiguous";
			targetRef: string;
			candidates?: Array<{ id: number; vocabulary: string; kind: string }>;
	  };

export async function loadSymbolMap(sql: Sql): Promise<SymbolMap> {
	const rows = await sql<SymbolRow[]>`
		SELECT s.id, s.vocabulary_id, s.local_name, s.kind, s.parent_symbol_id
		FROM xsd_symbols s
		JOIN xsd_symbol_profiles sp ON sp.symbol_id = s.id
		JOIN xsd_profiles p ON p.id = sp.profile_id
		WHERE p.name = 'transitional'
	`;
	const byVocabAndName = new Map<string, SymbolRow[]>();
	for (const r of rows) {
		const key = `${r.vocabulary_id}|${r.local_name}`;
		if (!byVocabAndName.has(key)) byVocabAndName.set(key, []);
		byVocabAndName.get(key)!.push(r);
	}
	return { all: rows, byVocabAndName };
}

/**
 * Map an ECMA (partNumber, section) to a candidate vocabulary list. The
 * ordering matters: when a name resolves in multiple vocabularies, we pick
 * the first hit in this list.
 *
 * Part 4 (Transitional Migration Features) is VML / legacy and not in our
 * ingested XSD set - every Part 4 page maps to no vocabulary, producing a
 * target_ref instead of a wrong symbol attachment.
 *
 * Part 1 sections 13 (PML) and 18 (SML) are also outside the current XSD
 * scope; they are documented here returning [] for the same reason.
 */
function inferVocabularies(partNumber: number | null, section: string): string[] {
	const m = section.match(/^(\d+)/);
	if (!m) return [];
	const major = parseInt(m[1], 10);

	// Part 4 = Transitional Migration Features = VML and legacy DrawingML;
	// not currently ingested.
	if (partNumber === 4) return [];

	switch (major) {
		case 13:
			return []; // PresentationML - not ingested
		case 14:
		case 15:
			return []; // VML
		case 17:
			return ["wml-main"];
		case 18:
			return []; // SpreadsheetML - not ingested
		case 19:
			return []; // PresentationML - not ingested
		case 20:
			return ["dml-main", "dml-pic", "dml-wp", "shared-types"];
		case 21:
			return ["dml-chart", "dml-diagram", "dml-chartDrawing", "dml-main"];
		case 22: {
			// 22.x is split: 22.1 = math, 22.9 = shared simple types, others
			// (22.2 ext-props, 22.3 custom-props, 22.4 bibliography, etc.) are
			// not in our ingest scope.
			const sub = section.match(/^22\.(\d+)/);
			const minor = sub ? parseInt(sub[1], 10) : 0;
			if (minor === 1) return ["shared-math"];
			if (minor === 9) return ["shared-types"];
			return [];
		}
		default:
			return [];
	}
}

const KIND_PRIORITY = [
	"element",
	"complexType",
	"simpleType",
	"attributeGroup",
	"group",
	"attribute",
];

function kindRank(kind: string): number {
	const idx = KIND_PRIORITY.indexOf(kind);
	return idx === -1 ? KIND_PRIORITY.length : idx;
}

export function resolveSymbol(
	map: SymbolMap,
	name: string,
	ecmaSection: string,
	partNumber: number | null,
): ResolutionOutcome {
	const vocabs = inferVocabularies(partNumber, ecmaSection);
	if (vocabs.length === 0) {
		return {
			resolved: false,
			reason: "no-vocabulary",
			targetRef: `Section ${ecmaSection}, ${name}`,
		};
	}

	const candidates: SymbolRow[] = [];
	for (const v of vocabs) {
		const rows = map.byVocabAndName.get(`${v}|${name}`) ?? [];
		candidates.push(...rows);
	}

	if (candidates.length === 0) {
		return {
			resolved: false,
			reason: "no-match",
			targetRef: `Section ${ecmaSection}, ${name} (searched: ${vocabs.join(", ")})`,
		};
	}

	// Prefer top-level (parent_symbol_id IS NULL) over local element decls.
	const topLevel = candidates.filter((c) => c.parent_symbol_id === null);
	const pool = topLevel.length > 0 ? topLevel : candidates;

	const sorted = [...pool].sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
	const bestKind = sorted[0].kind;
	const bestKindMatches = sorted.filter((c) => c.kind === bestKind);

	if (bestKindMatches.length === 1) {
		const winner = bestKindMatches[0];
		// High confidence when only one vocab was tried; medium when we had to
		// pick across multiple DrawingML vocabs.
		const confidence: "high" | "medium" = vocabs.length === 1 ? "high" : "medium";
		return {
			resolved: true,
			symbolId: winner.id,
			symbolKind: winner.kind,
			vocabulary: winner.vocabulary_id,
			confidence,
			isLocal: winner.parent_symbol_id !== null,
		};
	}

	return {
		resolved: false,
		reason: "ambiguous",
		targetRef: `Section ${ecmaSection}, ${name}`,
		candidates: bestKindMatches.map((c) => ({
			id: c.id,
			vocabulary: c.vocabulary_id,
			kind: c.kind,
		})),
	};
}
