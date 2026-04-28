/**
 * Table-driven verb-classifier tests. Each row maps a representative behavior
 * sentence to the (claim_type, confidence) we expect.
 */

import { expect, test } from "bun:test";
import { classifyClaim } from "../../scripts/ingest-ms-oi29500/claim-type.ts";

interface Case {
	text: string;
	claimType:
		| "ignores"
		| "requires_despite_optional"
		| "writes"
		| "reads_but_does_not_write"
		| "repairs"
		| "layout_behavior"
		| "does_not_support"
		| "varies_from_spec";
	confidence: "high" | "medium" | "low";
}

const CASES: Case[] = [
	{
		text: "Word ignores the moveFromRangeStart element.",
		claimType: "ignores",
		confidence: "high",
	},
	{
		text: "Office does not support this attribute.",
		claimType: "does_not_support",
		confidence: "high",
	},
	{
		text: "Word does not allow textbox content inside endnotes.",
		claimType: "does_not_support",
		confidence: "high",
	},
	{
		text: "Word will save an mce choice for VML content.",
		claimType: "writes",
		confidence: "high",
	},
	{
		text: "Word writes an extra w:rPr child even though the spec doesn't require it.",
		claimType: "writes",
		confidence: "high",
	},
	{
		text: "Word reads the value but does not write it on save.",
		claimType: "reads_but_does_not_write",
		confidence: "high",
	},
	{
		text: "Word renders this attribute as an absolute coordinate.",
		claimType: "layout_behavior",
		confidence: "medium",
	},
	{
		text: "Word requires the val attribute despite the spec marking it optional.",
		claimType: "requires_despite_optional",
		confidence: "medium",
	},
	{
		text: "Word repairs malformed table cell widths on read.",
		claimType: "repairs",
		confidence: "medium",
	},
	{
		text: "Some unrelated prose that doesn't match any verb pattern.",
		claimType: "varies_from_spec",
		confidence: "low",
	},
];

for (const { text, claimType, confidence } of CASES) {
	test(`${claimType}/${confidence}: ${text.slice(0, 40)}...`, () => {
		const result = classifyClaim(text);
		expect(result.claimType).toBe(claimType);
		expect(result.confidence).toBe(confidence);
	});
}
