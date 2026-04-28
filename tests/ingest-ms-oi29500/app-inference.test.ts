/**
 * Tests for inferApp + minConfidence helpers.
 */

import { expect, test } from "bun:test";
import {
	inferApp,
	minConfidence,
} from "../../scripts/ingest-ms-oi29500/app-inference.ts";

test("inferApp: section 17 → Word", () => {
	expect(inferApp(1, "17.4.37")).toBe("Word");
});

test("inferApp: section 18 → Excel", () => {
	expect(inferApp(1, "18.18.89")).toBe("Excel");
});

test("inferApp: section 13 → PowerPoint", () => {
	expect(inferApp(1, "13.3.1")).toBe("PowerPoint");
});

test("inferApp: section 19 (Part 1) → PowerPoint (PML elements)", () => {
	expect(inferApp(1, "19.7.48")).toBe("PowerPoint");
});

test("inferApp: section 20 → Office (DrawingML, cross-app)", () => {
	expect(inferApp(1, "20.1.4.2.9")).toBe("Office");
});

test("inferApp: section 22.1 → Word (math)", () => {
	expect(inferApp(1, "22.1.2.87")).toBe("Word");
});

test("inferApp: section 22.9 → Office (shared types)", () => {
	expect(inferApp(1, "22.9.2.14")).toBe("Office");
});

test("inferApp: Part 4 (VML) → Office without text override", () => {
	expect(inferApp(4, "14.9.1.1")).toBe("Office");
});

test("inferApp: behavior text override beats section default", () => {
	// Part 4 default is Office, but the text mentions only Word.
	expect(
		inferApp(4, "14.9.1.1", "Word does not allow textbox content inside endnotes."),
	).toBe("Word");
});

test("inferApp: multiple app mentions in text → fall back to section default", () => {
	expect(
		inferApp(1, "17.4.37", "Word and Excel both interpret this differently."),
	).toBe("Word"); // section 17 default
});

test("inferApp: missing inputs → Office", () => {
	expect(inferApp(null, null)).toBe("Office");
	expect(inferApp(1, null)).toBe("Office");
});

test("minConfidence: returns the lowest non-null", () => {
	expect(minConfidence("high", "medium")).toBe("medium");
	expect(minConfidence("high", "low")).toBe("low");
	expect(minConfidence("medium", "high")).toBe("medium");
});

test("minConfidence: skips nulls", () => {
	expect(minConfidence("high", null)).toBe("high");
	expect(minConfidence(null, "low")).toBe("low");
	expect(minConfidence(null, null)).toBeNull();
	expect(minConfidence()).toBeNull();
});
