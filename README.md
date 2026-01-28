<img width="300" alt="logo" src="https://github.com/user-attachments/assets/df6311a6-c050-4592-bbf1-4a2228655bc3" />

[![Web](https://img.shields.io/badge/Web-v0.1.3-blue)](https://ooxml.dev)
[![MCP Server](https://img.shields.io/badge/MCP_Server-v0.0.1-blue)](https://api.ooxml.dev/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The OOXML spec, explained by people who actually implemented it.

## What is this?

An interactive reference for ECMA-376 (Office Open XML) with:

- **Live previews** - See XML rendered in real-time with SuperDoc
- **Implementation notes** - Real-world gotchas from building document processors
- **Practical examples** - Working code, not just spec excerpts

## Why?

The official ECMA-376 spec is 5,000+ pages. Most of it you'll never need. This reference focuses on what matters for building document tools, with insights from implementing [SuperDoc](https://superdoc.dev).

## MCP Server ![New](https://img.shields.io/badge/New-blue)

**The world's first ECMA-376 MCP server.** Ask Claude about OOXML and get answers grounded in the actual spec.

```bash
claude mcp add --transport http ecma-spec https://api.ooxml.dev/mcp
```

Example: *"How do I set paragraph spacing in WordprocessingML?"* - Claude searches 18,000+ spec chunks and returns the relevant sections.

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun dev

# Build for production
bun run build
```

## Contributing

Contributions welcome! Add implementation notes, fix examples, or improve docs.

## License

MIT

---

Built by 🦋[SuperDoc](https://superdoc.dev)
