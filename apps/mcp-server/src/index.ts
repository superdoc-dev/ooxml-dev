// ECMA-376 Spec MCP Server
// Cloudflare Worker entry point

export interface Env {
	DATABASE_URL: string;
	OPENAI_API_KEY?: string;
}

export default {
	async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === "/health") {
			return new Response(JSON.stringify({ status: "ok" }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		// MCP endpoint (to be implemented)
		if (url.pathname === "/mcp") {
			return new Response(
				JSON.stringify({
					error: "MCP server not yet implemented",
					tools: ["search_ecma_spec", "get_section", "get_context", "list_parts"],
				}),
				{
					status: 501,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response("ECMA-376 Spec MCP Server", {
			headers: { "Content-Type": "text/plain" },
		});
	},
};
