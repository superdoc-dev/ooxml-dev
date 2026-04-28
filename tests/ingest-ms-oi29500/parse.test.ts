/**
 * Parser tests against committed MS-OI29500 markdown fixtures. Each fixture
 * exercises one shape the parser must handle (or correctly skip).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
	entryIdFromTocTitle,
	parsePage,
} from "../../scripts/ingest-ms-oi29500/parse.ts";

const FIXTURES = join(import.meta.dir, "fixtures");

function load(name: string): string {
	return readFileSync(join(FIXTURES, `${name}.md`), "utf8");
}

test("txbxContent: 2 claim groups, version-scope on b", () => {
	const parsed = parsePage(load("txbxContent"), { entryId: "2.1.1779" });
	expect(parsed.ingestable).toBe(true);
	expect(parsed.parsedTitle?.partNumber).toBe(4);
	expect(parsed.parsedTitle?.ecmaSection).toBe("14.9.1.1");
	expect(parsed.parsedTitle?.name).toBe("txbxContent");
	expect(parsed.entryId).toBe("2.1.1779");
	expect(parsed.claims.length).toBe(2);
	expect(parsed.claims[0].label).toBe("a");
	expect(parsed.claims[1].label).toBe("b");
	expect(parsed.claims[0].behaviors.length).toBe(1);
	expect(parsed.claims[1].behaviors.length).toBe(1);
	expect(parsed.claims[1].behaviors[0].versionScope).toContain("Office 2013");
	expect(parsed.frontmatter.git_commit_id).toBeTruthy();
});

test("multi-claim-r (math run): 5 claim groups a-e, no version scope", () => {
	const parsed = parsePage(load("multi-claim-r"));
	expect(parsed.ingestable).toBe(true);
	expect(parsed.claims.length).toBe(5);
	expect(parsed.claims.map((c) => c.label)).toEqual(["a", "b", "c", "d", "e"]);
	for (const c of parsed.claims) {
		expect(c.behaviors.length).toBeGreaterThanOrEqual(1);
		for (const b of c.behaviors) expect(b.versionScope).toBeNull();
	}
});

test("see-also-only-rPr: skipped (no claim groups)", () => {
	const parsed = parsePage(load("see-also-only-rPr"));
	expect(parsed.ingestable).toBe(false);
	expect(parsed.skipReason).toContain("no claim groups");
	expect(parsed.parsedTitle?.name).toBe("rPr");
});

test("table-only-hlinkClick: skipped (claim header but no bullets)", () => {
	const parsed = parsePage(load("table-only-hlinkClick"));
	expect(parsed.ingestable).toBe(false);
	expect(parsed.skipReason).toContain("no behavior bullets");
	expect(parsed.claims.length).toBeGreaterThan(0);
});

test("cross-spec-fldSimple: skipped (no Part/Section in title)", () => {
	const parsed = parsePage(load("cross-spec-fldSimple"));
	expect(parsed.ingestable).toBe(false);
	expect(parsed.skipReason).toContain("Part/Section");
});

test("single-claim-ST_Visibility: 1 claim, 1 behavior", () => {
	const parsed = parsePage(load("single-claim-ST_Visibility"));
	expect(parsed.ingestable).toBe(true);
	expect(parsed.parsedTitle?.name).toBe("ST_Visibility");
	expect(parsed.claims.length).toBe(1);
	expect(parsed.claims[0].behaviors.length).toBe(1);
});

test("entryIdFromTocTitle parses the leading 2.x.x marker", () => {
	expect(entryIdFromTocTitle("2.1.1779 Part 4 Section 14.9.1.1, txbxContent (...)")).toBe(
		"2.1.1779",
	);
	expect(entryIdFromTocTitle("Conformance Statements")).toBeNull();
	expect(entryIdFromTocTitle(null)).toBeNull();
	expect(entryIdFromTocTitle(undefined)).toBeNull();
});
