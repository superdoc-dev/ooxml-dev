# ECMA-376 Spec MCP Server

**The world's first ECMA-376 MCP server** - semantic search across the entire Office Open XML specification.

- 18,000+ chunks from all 4 parts of ECMA-376
- Vector search powered by Voyage embeddings + pgvector
- Hosted on Cloudflare Workers

## Connect in Claude Code

```bash
claude mcp add --transport http ecma-spec https://api.ooxml.dev/mcp
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | GET | MCP server info |
| `/search` | POST | Semantic search (`{query, part?, limit?}`) |
| `/section` | GET | Get section (`?id=17.3.2&part=1`) |
| `/stats` | GET | Database stats |

## Development

```bash
# Install
bun install

# Run locally (needs .dev.vars with DATABASE_URL, VOYAGE_API_KEY)
wrangler dev

# Deploy
wrangler deploy
```
