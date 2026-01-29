/**
 * ECMA-376 Spec MCP Server
 *
 * Cloudflare Worker that exposes ECMA-376 specification search via MCP protocol.
 *
 * Tools:
 * - search_ecma_spec: Semantic search across the spec
 * - get_section: Get specific section by ID
 * - list_parts: List spec parts and sections
 */

import { createDb } from "./db";
import { embedQuery } from "./embeddings";
import { handleMcpRequest } from "./mcp";

export interface Env {
	DATABASE_URL: string;
	VOYAGE_API_KEY: string;
}

// Part descriptions
const PART_DESCRIPTIONS: Record<number, string> = {
	1: "Fundamentals and Markup Language Reference",
	2: "Open Packaging Conventions",
	3: "Markup Compatibility and Extensibility",
	4: "Transitional Migration Features",
};

// CORS allowed origins
const ALLOWED_ORIGINS = ["https://ooxml.dev", "https://www.ooxml.dev"];
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function getCorsHeaders(request: Request, _env: Env): Record<string, string> {
	const origin = request.headers.get("Origin");
	if (!origin) return {};

	// Always allow localhost origins (safe - can only be used when running locally)
	const allowedOrigins = [...ALLOWED_ORIGINS, ...DEV_ORIGINS];

	if (allowedOrigins.includes(origin)) {
		return {
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};
	}

	return {};
}

function addCorsHeaders(response: Response, corsHeaders: Record<string, string>): Response {
	if (Object.keys(corsHeaders).length === 0) return response;

	const newHeaders = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders)) {
		newHeaders.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const corsHeaders = getCorsHeaders(request, env);

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		// Health check
		if (url.pathname === "/health") {
			return addCorsHeaders(
				new Response(JSON.stringify({ status: "ok" }), {
					headers: { "Content-Type": "application/json" },
				}),
				corsHeaders,
			);
		}

		// MCP endpoint
		if (url.pathname === "/mcp" || url.pathname === "/sse") {
			if (request.method === "POST") {
				// MCP protocol (JSON-RPC)
				const response = await handleMcpRequest(request, env);
				return addCorsHeaders(response, corsHeaders);
			}
			// GET returns server info for debugging
			return addCorsHeaders(handleMcpInfo(), corsHeaders);
		}

		// REST API endpoints
		if (url.pathname === "/search" && request.method === "POST") {
			const response = await handleSearch(request, env);
			return addCorsHeaders(response, corsHeaders);
		}

		if (url.pathname === "/section" && request.method === "GET") {
			const response = await handleGetSection(request, env);
			return addCorsHeaders(response, corsHeaders);
		}

		if (url.pathname === "/stats") {
			const response = await handleStats(env);
			return addCorsHeaders(response, corsHeaders);
		}

		return addCorsHeaders(
			new Response(
				JSON.stringify({
					name: "ECMA-376 Spec MCP Server",
					version: "0.1.0",
					endpoints: {
						mcp: "/mcp",
						health: "/health",
						search: "POST /search",
						section: "GET /section?id=17.3.2&part=1",
						stats: "/stats",
					},
				}),
				{
					headers: { "Content-Type": "application/json" },
				},
			),
			corsHeaders,
		);
	},
};

// MCP info endpoint (GET for debugging)
function handleMcpInfo(): Response {
	return new Response(
		JSON.stringify({
			name: "ecma-spec",
			version: "0.1.0",
			description: "ECMA-376 (Office Open XML) specification search server",
			tools: [
				{
					name: "search_ecma_spec",
					description: "Search the ECMA-376 specification semantically",
					inputSchema: {
						type: "object",
						properties: {
							query: { type: "string", description: "Natural language search query" },
							part: { type: "number", description: "Filter by part number (1-4)" },
							limit: { type: "number", description: "Max results (default: 5)" },
						},
						required: ["query"],
					},
				},
				{
					name: "get_section",
					description: "Get a specific section by ID",
					inputSchema: {
						type: "object",
						properties: {
							section_id: { type: "string", description: "Section ID (e.g., '17.3.2')" },
							part: { type: "number", description: "Part number (1-4)" },
						},
						required: ["section_id"],
					},
				},
				{
					name: "list_parts",
					description: "List spec parts and sections",
					inputSchema: {
						type: "object",
						properties: {
							part: { type: "number", description: "Filter by part number (1-4)" },
						},
					},
				},
			],
		}),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
}

// REST API handlers for testing
async function handleSearch(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as { query: string; part?: number; limit?: number };
		const { query, part, limit = 5 } = body;

		if (!query) {
			return new Response(JSON.stringify({ error: "Missing query" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const db = createDb(env.DATABASE_URL);
		const embedding = await embedQuery(query, env.VOYAGE_API_KEY);
		const results = await db.search(embedding, { limit, partNumber: part });

		return new Response(JSON.stringify({ query, results }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}

async function handleGetSection(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const sectionId = url.searchParams.get("id");
	const part = url.searchParams.get("part");

	if (!sectionId) {
		return new Response(JSON.stringify({ error: "Missing id parameter" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const db = createDb(env.DATABASE_URL);
	const results = await db.getBySection(sectionId, part ? parseInt(part, 10) : undefined);

	return new Response(JSON.stringify({ sectionId, part, results }), {
		headers: { "Content-Type": "application/json" },
	});
}

async function handleStats(env: Env): Promise<Response> {
	const db = createDb(env.DATABASE_URL);
	const stats = await db.getStats();

	return new Response(
		JSON.stringify({
			...stats,
			parts: PART_DESCRIPTIONS,
		}),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
}
