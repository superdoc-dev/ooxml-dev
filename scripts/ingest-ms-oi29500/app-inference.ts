/**
 * Map an MS-OI29500 entry's (partNumber, ecmaSection) to the Office app the
 * note describes.
 *
 * MS-OI29500 covers Word, Excel, and PowerPoint behaviors. Tagging every row
 * as 'Word' (the previous default) made `app=Word` queries return Excel and
 * PowerPoint behavior alongside Word's. Section numbers cleanly disambiguate
 * the typical case; legitimately cross-app pages use 'Office'.
 */

export type Office = "Word" | "Excel" | "PowerPoint" | "Office";

/**
 * Infer the Office app a behavior note describes. Two-stage:
 *
 *   1. If `behaviorText` mentions exactly one app name (Word / Excel /
 *      PowerPoint), trust the text. This catches Part 4 / DrawingML pages
 *      whose section number is generic but whose behavior text is
 *      app-specific.
 *   2. Otherwise fall back to section-based inference.
 *
 * `Office` is the bucket for legitimately cross-app or undeterminable rows.
 */
export function inferApp(
	partNumber: number | null,
	ecmaSection: string | null,
	behaviorText?: string,
): Office {
	if (behaviorText) {
		const w = /\bWord\b/.test(behaviorText);
		const e = /\bExcel\b/.test(behaviorText);
		const p = /\bPowerPoint\b/.test(behaviorText);
		const hits = (w ? 1 : 0) + (e ? 1 : 0) + (p ? 1 : 0);
		if (hits === 1) {
			if (w) return "Word";
			if (e) return "Excel";
			if (p) return "PowerPoint";
		}
		// Two or more apps mentioned (or zero) → fall through to section-based.
	}

	if (partNumber === 4) {
		// Part 4 is the Transitional Migration spec - VML and legacy DrawingML
		// extensions used across multiple apps. Tag generic.
		return "Office";
	}
	if (!ecmaSection) return "Office";
	const major = parseInt(ecmaSection.match(/^(\d+)/)?.[1] ?? "", 10);
	switch (major) {
		case 11:
			return "Word"; // WML overview
		case 13:
			return "PowerPoint"; // PML overview
		case 17:
			return "Word"; // WordprocessingML
		case 18:
			return "Excel"; // SpreadsheetML
		case 19:
			return "PowerPoint"; // PML elements (Part 1)
		case 20:
		case 21:
			return "Office"; // DrawingML - used by all three apps
		case 22: {
			// 22.1 = math (Word); 22.2-22.x = shared / extended properties.
			const sub = ecmaSection.match(/^22\.(\d+)/);
			const minor = sub ? parseInt(sub[1], 10) : 0;
			return minor === 1 ? "Word" : "Office";
		}
		default:
			// Sections 2-10 are conformance / introduction / shared content.
			return "Office";
	}
}

const RANK: Record<"high" | "medium" | "low", number> = { high: 3, medium: 2, low: 1 };

/** min by confidence rank (low < medium < high). NULL inputs are skipped. */
export function minConfidence(
	...values: Array<"high" | "medium" | "low" | null | undefined>
): "high" | "medium" | "low" | null {
	let best: "high" | "medium" | "low" | null = null;
	for (const v of values) {
		if (!v) continue;
		if (best === null || RANK[v] < RANK[best]) best = v;
	}
	return best;
}
