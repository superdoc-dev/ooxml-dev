/**
 * Map a behavior text snippet to a `behavior_notes.claim_type` enum value.
 *
 * The patterns reflect Microsoft's MS-OI29500 phrasing conventions. Order
 * matters: more specific patterns are checked first. Unmatched text falls
 * through to `varies_from_spec` with low confidence - that's better than
 * mis-classifying as `writes`, which would pollute the table.
 *
 * Confidence here is the parser's certainty about the classification, not
 * Microsoft's certainty about the claim. It maps to
 * `behavior_notes.resolution_confidence`.
 */

export type ClaimType =
	| "ignores"
	| "requires_despite_optional"
	| "writes"
	| "reads_but_does_not_write"
	| "repairs"
	| "layout_behavior"
	| "does_not_support"
	| "varies_from_spec";

export interface ClaimTypeResult {
	claimType: ClaimType;
	confidence: "high" | "medium" | "low";
}

interface Pattern {
	regex: RegExp;
	claimType: ClaimType;
	confidence: "high" | "medium" | "low";
}

// Order matters: more specific patterns first. Patterns are case-insensitive
// and match anywhere in the text (no word boundaries on regex starts so we
// pick up phrases mid-sentence).
const PATTERNS: Pattern[] = [
	// Read/write asymmetry - most specific.
	{
		regex: /\b(?:reads?|interprets?)\b[^.]*\b(?:does not write|will not write|ignores on write)\b/i,
		claimType: "reads_but_does_not_write",
		confidence: "high",
	},

	// Explicit ignores.
	{
		regex: /\b(?:Word|Office|PowerPoint|Excel)\s+ignores\b/i,
		claimType: "ignores",
		confidence: "high",
	},

	// "does not support" / "does not allow" - the does_not_support enum was
	// added precisely because these are common in MS-OI29500 and don't fit
	// "ignores" cleanly (Word may also fail / repair / drop).
	{ regex: /\bdoes not support\b/i, claimType: "does_not_support", confidence: "high" },
	{ regex: /\bdoes not allow\b/i, claimType: "does_not_support", confidence: "high" },

	// Writes / saves - Word emits this even though spec doesn't require it,
	// or emits in a non-standard way.
	{
		regex: /\b(?:Word|Office|PowerPoint|Excel)\s+(?:will\s+)?(?:saves?|writes?|emits?|stores?)\b/i,
		claimType: "writes",
		confidence: "high",
	},

	// Repairs / treats-invalid-as.
	{ regex: /\brepairs?\b/i, claimType: "repairs", confidence: "medium" },
	{
		regex: /\btreats?\b[^.]*\b(?:as|like)\b[^.]*\b(?:if invalid|when invalid)\b/i,
		claimType: "repairs",
		confidence: "medium",
	},

	// Layout / rendering / interpretation. "Treats X as Y" without an
	// invalidity clause typically signals layout/interpretation.
	{
		regex: /\b(?:Word|Office|Excel|PowerPoint)\s+renders?\b/i,
		claimType: "layout_behavior",
		confidence: "medium",
	},
	{
		regex: /\b(?:Word|Office|Excel|PowerPoint)\s+(?:displays?|interprets?)\b/i,
		claimType: "layout_behavior",
		confidence: "medium",
	},
	{ regex: /\bfor\s+layout\b/i, claimType: "layout_behavior", confidence: "medium" },

	// Required-despite-optional.
	{
		regex: /\b(?:Word|Office|Excel|PowerPoint)\s+requires\b/i,
		claimType: "requires_despite_optional",
		confidence: "medium",
	},
	{
		regex: /\btreats?\s+(?:the\s+)?(?:optional\s+)?[^.]*\bas\s+required\b/i,
		claimType: "requires_despite_optional",
		confidence: "medium",
	},

	// Generic reads.
	{
		regex: /\b(?:Word|Office|Excel|PowerPoint)\s+reads?\b/i,
		claimType: "reads_but_does_not_write",
		confidence: "medium",
	},
];

export function classifyClaim(behaviorText: string): ClaimTypeResult {
	for (const p of PATTERNS) {
		if (p.regex.test(behaviorText)) {
			return { claimType: p.claimType, confidence: p.confidence };
		}
	}
	return { claimType: "varies_from_spec", confidence: "low" };
}
