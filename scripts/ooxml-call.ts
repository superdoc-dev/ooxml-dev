/**
 * Local end-to-end harness for the Phase 4 OOXML tools.
 *
 * The deployed Worker uses @neondatabase/serverless (HTTP-only), which can't
 * talk to local Postgres. This CLI bypasses the Worker and dispatches through
 * `runOoxmlTool` directly with a postgres.js-backed sql function, so the same
 * code path that the Worker exercises runs end-to-end against the dev DB.
 *
 * Usage:
 *   bun scripts/ooxml-call.ts <tool> <jsonArgs>
 *   bun scripts/ooxml-call.ts ooxml_children '{"qname":"w:tbl"}'
 *   bun scripts/ooxml-call.ts ooxml_attributes '{"qname":"w:pBdr"}'
 *   bun scripts/ooxml-call.ts ooxml_enum '{"qname":"w:ST_Jc"}'
 *
 * Environment:
 *   DATABASE_URL - postgres connection string (defaults to local docker)
 */

import {
	isOoxmlTool,
	type OoxmlToolName,
	runOoxmlTool,
} from "../apps/mcp-server/src/ooxml-tools.ts";
import { createDbClient } from "../packages/shared/src/db/index.ts";

async function main() {
	const [, , toolArg, argsArg] = process.argv;
	if (!toolArg) {
		console.error("Usage: bun scripts/ooxml-call.ts <tool> [jsonArgs]");
		console.error("Tools: ooxml_lookup_element, ooxml_lookup_type, ooxml_children,");
		console.error("       ooxml_attributes, ooxml_enum, ooxml_namespace_info");
		process.exit(1);
	}
	if (!isOoxmlTool(toolArg)) {
		console.error(`Unknown tool: ${toolArg}`);
		process.exit(1);
	}

	const args: Record<string, unknown> = argsArg ? JSON.parse(argsArg) : {};

	const databaseUrl =
		process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/ecma_spec";
	const db = createDbClient(databaseUrl);

	try {
		const text = await runOoxmlTool(toolArg as OoxmlToolName, args, db.sql);
		console.log(text);
	} finally {
		await db.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
