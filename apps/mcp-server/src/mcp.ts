/**
 * MCP Protocol Handler
 *
 * Implements JSON-RPC 2.0 message handling for MCP Streamable HTTP transport.
 */

import { createDb } from "./db";
import { embedQuery } from "./embeddings";
import type { Env } from "./index";

// JSON-RPC types
interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: number | string | null;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

interface ToolCallParams {
	name: string;
	arguments?: Record<string, unknown>;
}

// Part descriptions
const PART_DESCRIPTIONS: Record<number, string> = {
	1: "Fundamentals and Markup Language Reference",
	2: "Open Packaging Conventions",
	3: "Markup Compatibility and Extensibility",
	4: "Transitional Migration Features",
};

// Tool definitions
const TOOLS = [
	{
		name: "search_ecma_spec",
		description:
			"Search the ECMA-376 (Office Open XML) specification semantically. Returns relevant sections based on natural language queries.",
		inputSchema: {
			type: "object" as const,
			properties: {
				query: {
					type: "string",
					description: "Natural language search query (e.g., 'paragraph spacing', 'table borders')",
				},
				part: {
					type: "number",
					description:
						"Filter by part number: 1=Fundamentals, 2=OPC, 3=Compatibility, 4=Transitional",
				},
				limit: { type: "number", description: "Max results (default: 5, max: 20)" },
			},
			required: ["query"],
		},
	},
	{
		name: "get_section",
		description:
			"Get a specific section of the ECMA-376 specification by section ID (e.g., '17.3.2' for paragraph properties).",
		inputSchema: {
			type: "object" as const,
			properties: {
				section_id: {
					type: "string",
					description: "Section ID (e.g., '17.3.2', '17.4.1')",
				},
				part: { type: "number", description: "Part number (1-4)" },
			},
			required: ["section_id"],
		},
	},
	{
		name: "list_parts",
		description: "List ECMA-376 specification parts and their top-level sections.",
		inputSchema: {
			type: "object" as const,
			properties: {
				part: { type: "number", description: "Filter by part number (1-4)" },
			},
		},
	},
];

// JSON-RPC error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function jsonResponse(data: JsonRpcResponse): Response {
	return new Response(JSON.stringify(data), {
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(
	id: number | string | null,
	code: number,
	message: string,
	data?: unknown,
): Response {
	return jsonResponse({
		jsonrpc: "2.0",
		id,
		error: { code, message, data },
	});
}

function handleInitialize(id: number | string | null): JsonRpcResponse {
	return {
		jsonrpc: "2.0",
		id,
		result: {
			protocolVersion: "2024-11-05",
			capabilities: {
				tools: {},
			},
			serverInfo: {
				name: "ecma-spec",
				version: "0.1.0",
			},
			instructions:
				"ECMA-376 (Office Open XML) specification search server. Use search_ecma_spec for semantic search, get_section for specific sections, or list_parts to browse the spec structure.",
		},
	};
}

function handleToolsList(id: number | string | null): JsonRpcResponse {
	return {
		jsonrpc: "2.0",
		id,
		result: {
			tools: TOOLS,
		},
	};
}

async function handleToolsCall(
	id: number | string | null,
	params: unknown,
	env: Env,
): Promise<JsonRpcResponse> {
	const { name, arguments: args } = params as ToolCallParams;

	if (!name) {
		return {
			jsonrpc: "2.0",
			id,
			error: { code: INVALID_PARAMS, message: "Missing tool name" },
		};
	}

	try {
		let resultText: string;

		switch (name) {
			case "search_ecma_spec": {
				const query = args?.query as string;
				const part = args?.part as number | undefined;
				const limit = Math.min((args?.limit as number) || 5, 20);

				if (!query) {
					return {
						jsonrpc: "2.0",
						id,
						error: { code: INVALID_PARAMS, message: "Missing required parameter: query" },
					};
				}

				const db = createDb(env.DATABASE_URL);
				const embedding = await embedQuery(query, env.VOYAGE_API_KEY);
				const results = await db.search(embedding, { limit, partNumber: part });

				resultText = formatSearchResults(query, results);
				break;
			}

			case "get_section": {
				const sectionId = args?.section_id as string;
				const part = args?.part as number | undefined;

				if (!sectionId) {
					return {
						jsonrpc: "2.0",
						id,
						error: { code: INVALID_PARAMS, message: "Missing required parameter: section_id" },
					};
				}

				const db = createDb(env.DATABASE_URL);
				const results = await db.getBySection(sectionId, part);

				resultText = formatSectionResults(sectionId, results);
				break;
			}

			case "list_parts": {
				const part = args?.part as number | undefined;

				const db = createDb(env.DATABASE_URL);
				const sections = await db.listSections(part);

				resultText = formatPartsList(sections, part);
				break;
			}

			default:
				return {
					jsonrpc: "2.0",
					id,
					error: { code: METHOD_NOT_FOUND, message: `Unknown tool: ${name}` },
				};
		}

		return {
			jsonrpc: "2.0",
			id,
			result: {
				content: [{ type: "text", text: resultText }],
			},
		};
	} catch (error) {
		return {
			jsonrpc: "2.0",
			id,
			error: {
				code: INTERNAL_ERROR,
				message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
			},
		};
	}
}

// Format helpers
function formatSearchResults(
	query: string,
	results: Array<{
		sectionId: string | null;
		title: string | null;
		content: string;
		partNumber: number;
		score: number;
	}>,
): string {
	if (results.length === 0) {
		return `No results found for "${query}".`;
	}

	let output = `## Search Results for "${query}"\n\n`;

	for (const r of results) {
		const partDesc = PART_DESCRIPTIONS[r.partNumber] || `Part ${r.partNumber}`;
		output += `### ${r.sectionId || "Section"}: ${r.title || "Untitled"}\n`;
		output += `**Part ${r.partNumber}** - ${partDesc} (relevance: ${(r.score * 100).toFixed(1)}%)\n\n`;
		output += `${r.content}\n\n---\n\n`;
	}

	return output;
}

function formatSectionResults(
	sectionId: string,
	results: Array<{
		sectionId: string | null;
		title: string | null;
		content: string;
		partNumber: number;
		contentType: string;
	}>,
): string {
	if (results.length === 0) {
		return `Section "${sectionId}" not found.`;
	}

	let output = `## Section ${sectionId}\n\n`;

	for (const r of results) {
		const partDesc = PART_DESCRIPTIONS[r.partNumber] || `Part ${r.partNumber}`;
		if (r.title) {
			output += `### ${r.title}\n`;
		}
		output += `**Part ${r.partNumber}** - ${partDesc}\n\n`;
		output += `${r.content}\n\n`;
	}

	return output;
}

function formatPartsList(
	sections: Array<{ sectionId: string; title: string; partNumber: number }>,
	filterPart?: number,
): string {
	let output = filterPart
		? `## ECMA-376 Part ${filterPart}: ${PART_DESCRIPTIONS[filterPart]}\n\n`
		: "## ECMA-376 Specification Parts\n\n";

	if (!filterPart) {
		output += "The ECMA-376 specification consists of 4 parts:\n\n";
		for (const [num, desc] of Object.entries(PART_DESCRIPTIONS)) {
			output += `- **Part ${num}**: ${desc}\n`;
		}
		output += "\n---\n\n";
	}

	// Group by part
	const byPart = new Map<number, typeof sections>();
	for (const s of sections) {
		if (!byPart.has(s.partNumber)) {
			byPart.set(s.partNumber, []);
		}
		byPart.get(s.partNumber)!.push(s);
	}

	// Limit sections shown per part
	const MAX_SECTIONS = 50;

	for (const [partNum, partSections] of byPart) {
		if (!filterPart) {
			output += `### Part ${partNum}: ${PART_DESCRIPTIONS[partNum]}\n\n`;
		}

		const shown = partSections.slice(0, MAX_SECTIONS);
		for (const s of shown) {
			output += `- **${s.sectionId}**: ${s.title}\n`;
		}

		if (partSections.length > MAX_SECTIONS) {
			output += `- ... and ${partSections.length - MAX_SECTIONS} more sections\n`;
		}
		output += "\n";
	}

	return output;
}

/**
 * Main MCP request handler
 */
export async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
	// Only accept POST
	if (request.method !== "POST") {
		return errorResponse(null, INVALID_REQUEST, "MCP requires POST requests");
	}

	let body: JsonRpcRequest;
	try {
		body = (await request.json()) as JsonRpcRequest;
	} catch {
		return errorResponse(null, PARSE_ERROR, "Invalid JSON");
	}

	// Validate JSON-RPC structure
	if (body.jsonrpc !== "2.0" || !body.method) {
		return errorResponse(body.id ?? null, INVALID_REQUEST, "Invalid JSON-RPC request");
	}

	const id = body.id ?? null;

	switch (body.method) {
		case "initialize":
			return jsonResponse(handleInitialize(id));

		case "notifications/initialized":
			// Client notification that initialization is complete - just acknowledge
			return new Response(null, { status: 202 });

		case "tools/list":
			return jsonResponse(handleToolsList(id));

		case "tools/call":
			return jsonResponse(await handleToolsCall(id, body.params, env));

		default:
			return errorResponse(id, METHOD_NOT_FOUND, `Method not found: ${body.method}`);
	}
}
