/**
 * Snapshot the public MCP surface so a future rename or accidental drop
 * (between TOOLS, OOXML_TOOL_DEFS, and the docs) fails CI.
 *
 * No DB access; we exercise tools/list and the initialize handler. tools/call
 * is covered by the per-tool tests in ooxml-queries.test.ts.
 */

import { expect, test } from "bun:test";
import { handleMcpRequest } from "../../apps/mcp-server/src/mcp.ts";

const EXPECTED_TOOL_NAMES = [
	// Prose search (over the spec PDFs)
	"ooxml_search",
	"ooxml_section",
	"ooxml_parts",
	// Schema lookup (over the parsed XSDs)
	"ooxml_element",
	"ooxml_type",
	"ooxml_children",
	"ooxml_attributes",
	"ooxml_enum",
	"ooxml_namespace",
	// Implementation behavior notes (MS-OI29500)
	"ooxml_behavior",
] as const;

interface JsonRpcResponse {
	jsonrpc: string;
	id: number | string | null;
	result?: { tools?: Array<{ name: string }>; serverInfo?: { name: string } };
	error?: { code: number; message: string };
}

async function rpc(method: string, params?: unknown): Promise<JsonRpcResponse> {
	const req = new Request("https://example.invalid/mcp", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
	// Env is unused for tools/list and initialize.
	const env = { DATABASE_URL: "", VOYAGE_API_KEY: "" } as never;
	const res = await handleMcpRequest(req, env);
	return (await res.json()) as JsonRpcResponse;
}

test("tools/list returns the full ooxml_* tool set in the documented order", async () => {
	const r = await rpc("tools/list");
	const names = r.result?.tools?.map((t) => t.name) ?? [];
	expect(names).toEqual([...EXPECTED_TOOL_NAMES]);
});

test("initialize advertises serverInfo.name as 'ooxml'", async () => {
	const r = await rpc("initialize");
	expect(r.result?.serverInfo?.name).toBe("ooxml");
});
