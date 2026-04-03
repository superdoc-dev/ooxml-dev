---
name: "ooxml.dev"
tagline: "The OOXML spec, explained by people who actually implemented it."
version: 1
language: en
parent: SuperDoc
---

# ooxml.dev

## Strategy

### Overview

ooxml.dev is the interactive reference for ECMA-376 (Office Open XML) — built by the team behind SuperDoc — DOCX editing and tooling, a document engine that renders OOXML natively in the browser.

It exists because the SuperDoc — DOCX editing and tooling team needed better OOXML documentation and it didn't exist. The official spec is 5,000+ pages of PDFs that omit critical rendering details. Word's actual behavior diverges from the spec in ways you only discover by building against it. So we wrote down everything we learned — the structure, the gotchas, the places where the spec lies — and made it public.

What ooxml.dev really does is translate implementation experience into usable knowledge. Every page combines XML structure, live rendered previews (powered by SuperDoc), and implementation notes that tell you what the spec doesn't: where Word disagrees with the standard, what will break your implementation, and what to do about it.

The problem it solves is information asymmetry. The knowledge required to implement OOXML correctly is locked inside a handful of companies — Microsoft, the LibreOffice team, Aspose, a few others — and they have no incentive to share it. Developers attempting OOXML implementations are left with an unreliable 5,000-page spec and scattered Stack Overflow answers. ooxml.dev breaks that lock.

**Before ooxml.dev**: A developer implementing tables opens Part 1 of ECMA-376, finds a schema definition with no rendering guidance, marks `w:tblGrid` as optional because the spec says so, and watches Word crash on the output. They spend three days on Stack Overflow piecing together what went wrong.

**After ooxml.dev**: The same developer reads the tables page, sees the live preview, reads the critical note — "The spec marks `w:tblGrid` as optional. Word crashes without it. Always include it." — and moves on in five minutes.

**Long-term ambition**: ooxml.dev becomes the MDN Web Docs of Office Open XML — the first place any developer goes when they need to understand how .docx files actually work.

### Positioning

**Category**: Implementer's reference for Office Open XML — the first interactive, example-driven, experience-backed guide to ECMA-376.

**What ooxml.dev is NOT**:
- Not the spec itself — we explain the spec, we don't replace it
- Not an SDK or library — we teach the format, not an API
- Not a document editor or viewer — SuperDoc — DOCX editing and tooling is the product, this is the knowledge
- Not a consulting service — the knowledge is free and public
- Not academic documentation — every insight comes from shipping real code

**Competitive landscape**:

The OOXML documentation space has three layers:

1. **The raw standard** (ECMA-376 PDFs) — Authoritative but impenetrable. 5,000+ pages, no examples, no rendering guidance, no acknowledgment of where Word diverges from its own spec.
2. **SDK documentation** (Microsoft Open XML SDK) — .NET-specific API reference. Covers how to use one SDK, not how the format works. No rendering information. No cross-platform guidance.
3. **Scattered community knowledge** (Stack Overflow, blog posts) — Partial, often outdated, impossible to navigate systematically. The best answers tend to be single-issue solutions without broader context.

ooxml.dev sits above all three: structured like MDN, experience-backed like a senior engineer's notebook, and interactive in a way none of the above can be.

The commercial document vendors (Aspose, Syncfusion, TX Text Control, Nutrient) are adjacent but not competitors — they sell tools that abstract OOXML away so developers don't have to understand it. ooxml.dev does the opposite: it teaches OOXML so developers can make informed decisions about how to work with it, whether they build their own implementation or use a tool like SuperDoc.

**Structural differentiators**:
- **Live previews** — Every XML example renders in real-time via SuperDoc. No other OOXML reference shows you what the XML actually produces.
- **Implementation notes from production** — Not spec commentary. Notes from building a shipping document engine against real-world documents.
- **AI-native search** — MCP server with semantic vector search across 18,000+ spec chunks. The spec is searchable by meaning, not just keywords.
- **Real document corpus** — Backed by docx-corpus (1M+ real documents). Observations are tested against actual documents in the wild, not just spec examples.
- **Format-first, tool-agnostic** — Useful whether you're building on SuperDoc, Aspose, your own renderer, or just trying to understand a .docx file.

**The territory ooxml.dev owns**: The practical truth about OOXML — the gap between what the spec says and what actually works.

### Personality

**Dominant archetype**: The Cartographer — maps uncharted territory so others can navigate it. Earns trust by going first, documenting what they found, and sharing the map freely.

**Attributes the brand transmits**:
- Generosity
- Authority (earned, not claimed)
- Precision
- Directness
- Battle-tested pragmatism
- Approachability

**What ooxml.dev IS**:
- The guide you wish existed when you started
- Knowledge shared freely because hoarding it helps no one
- Precise where it matters, concise everywhere
- Opinionated from experience, not from speculation
- A public good that also happens to showcase SuperDoc

**What ooxml.dev is NOT**:
- A marketing site disguised as documentation
- A gatekeeper that shares just enough to upsell you
- Theoretical or academic — every note comes from shipping code
- A competitor to the spec — it's a companion to it
- Exhaustive for the sake of being exhaustive — it covers what implementers actually need

### Promise

ooxml.dev tells you what the spec doesn't.
ooxml.dev shows you what the XML actually renders to.
ooxml.dev saves you the weeks of trial-and-error we already went through.

**Base message**: ooxml.dev is the practical OOXML reference — built by implementers, for implementers, with live previews and the implementation notes the spec forgot to include.

**Synthesizing phrase**: ooxml.dev exists so no one has to reverse-engineer Word alone.

### Guardrails

**Tone summary**: Generous. Direct. Technical. Experienced. Unhurried.

**What the brand cannot be**:
- A content-marketing funnel that exists only to sell SuperDoc
- A shallow overview that doesn't go deep enough to be useful
- A spec rewrite that adds words without adding insight
- A site that prioritizes completeness over usefulness
- A resource that feels corporate or vendor-controlled

**Litmus test**: If it wouldn't help someone in the middle of an implementation, cut it.

---

## Voice

### Identity

We build document infrastructure at SuperDoc — DOCX editing and tooling, and we learned OOXML the hard way — by implementing it against thousands of real documents and watching things break in ways the spec never warned us about.

ooxml.dev is where we write down everything we learned. Not because we have to. Because the alternative — leaving every developer to independently discover that `w:tblGrid` crashes Word when omitted, or that style inheritance doesn't work the way the schema implies — is a waste of everyone's time. The knowledge exists. It should be accessible.

We are not a spec committee. We are not consultants. We are not selling you an answer. We are sharing what we found so you can build faster and break less.

**Essence**: The map to OOXML, drawn by people who walked the territory.

### Tagline & Slogans

**Primary tagline**: The OOXML spec, explained by people who actually implemented it.
_Use on homepage hero, social bios, link previews._

**Alternatives**:
- What the spec doesn't tell you about .docx files.
- OOXML, from implementation to understanding.
- The practical guide to Office Open XML.

**Slogans for different contexts**:
- Developer discovery: "5,000 pages of spec. The 200 that matter. The notes you actually need."
- AI/MCP context: "Ask the spec anything. Get answers grounded in implementation experience."
- Community pitch: "Hard-won OOXML knowledge, shared freely."
- SuperDoc connection: "Built by SuperDoc — DOCX editing and tooling. Open to everyone."
- Credibility: "Every example is a working document."

### Message Pillars

**Practical truth**
- The spec says one thing. Word does another. We document the difference.
- Every note comes from building and shipping a real document engine.

**Live proof**
- Every XML example renders in real-time. Edit it. See what changes.
- Not screenshots. Not descriptions. Working documents.

**Implementation-first**
- We lead with what will break your code, not with schema definitions.
- Critical notes, warnings, and gotchas — prioritized by how much time they'll save you.

**Open knowledge**
- Free. No sign-up. No paywall. No drip-fed content.
- The OOXML community deserves a shared reference, not siloed expertise.

**AI-searchable**
- 18,000+ spec chunks with semantic search via MCP server.
- Built for the way developers actually look things up now.

### Phrases

- "The spec marks it optional. Word crashes without it."
- "5,000 pages. We read them so you don't have to."
- "What the spec doesn't tell you."
- "Edit the XML. Watch it render. Understand the format."
- "Every example is a real document."
- "Implementation notes the spec forgot to include."
- "We broke things so you don't have to."
- "The map, not the territory."

### Tonal Rules

1. Write for someone in the middle of an implementation. They have a problem. Get to the point.
2. Lead with the insight, not the backstory. "Word ignores this attribute" not "In our experience building SuperDoc, we discovered that..."
3. One to two sentences per note. If it needs more, it's probably two notes.
4. Use `app: "Word"` when the behavior is Word-specific. Be precise about which application does what.
5. Show the XML. Always. Structure trees and live previews before prose.
6. Say "the spec says" and "Word does" — make the gap explicit.
7. Critical notes for things that break. Warnings for things that surprise. Info for context. Tips for shortcuts. Use the right level.
8. No hedging. "Word crashes without it" not "it's generally recommended to include it."
9. No marketing in the documentation. The content is the marketing.
10. Conversational but not casual. A senior engineer explaining to a peer, not a tutorial for beginners.

**Identity boundaries**:
- We are not a marketing site for SuperDoc. (SuperDoc benefits because the content is genuinely useful, not because we steer people toward it.)
- We are not the spec committee. We explain and annotate; we don't define the standard.
- We are not a tutorial site. We assume you know what XML is and what a .docx file does.
- We are not exhaustive by obligation. We cover what implementers need, in the order they need it.

| We Say | We Never Say |
|---|---|
| "Word crashes without it" | "It is recommended to include this element" |
| "The spec says optional. It's not." | "For optimal compatibility, consider including..." |
| "Style inheritance breaks here" | "There are some nuances to be aware of" |
| "See the live preview" | "Refer to the specification for details" |
| "We got this wrong three times" | "After extensive research and testing" |
| "This attribute does nothing in Word" | "This attribute may have limited support" |
| "Edit the XML and watch what happens" | "The following example demonstrates the concept" |

---

## Visual

### Colors

ooxml.dev uses its own coral accent, distinct from SuperDoc's blue, to establish an independent identity as a reference site.

**Primary — Coral**
`#C1463A` — Links, buttons, interactive elements, active states. An accessible shade of the original coral (4.99:1 on white, 4.58:1 on tertiary backgrounds).

**Accent — Spec Gold**
`#F59E0B` (amber-500) — Implementation notes, callout badges, warning states. Signals "attention — this is the insight you came for."

**Supporting palette**:
| Role | Hex | Usage |
|---|---|---|
| Critical note | `#ED4337` | Critical implementation notes — things that break |
| Warning note | `#F59E0B` | Non-obvious behavior, surprising gotchas |
| Info note | `#C1463A` | Context and background |
| Tip note | `#00853D` | Helpful shortcuts and techniques |
| Text primary | `#212121` | Headings, body copy |
| Text secondary | `#666666` | Supporting text, metadata |
| Code background | `#1E1E2E` | XML/code blocks (dark) |
| Page background | `#FFFFFF` | Main content area |
| Canvas | `#FAFAFA` | Sidebar, surrounding area |

**Colors to avoid**: Anything that competes with the note severity colors. Keep the content area neutral so the implementation notes — the primary value — stand out.

### Typography

Inherits SuperDoc's type system.

**Display / UI — Inter**
Weights: Regular (400), Medium (500), Semibold (600), Bold (700)
Usage: All interface text, headings, prose.

**Monospace — JetBrains Mono**
Weight: Regular (400)
Usage: XML examples, element names, attribute values, code blocks. This is the dominant font on most pages — the code is the content.

### Style

**Design keywords**: Clean. Structured. Technical. Readable. Generous whitespace. Code-forward.

**Reference brands**: Linear (systematic craft), Resend (developer docs done right), Vercel (infrastructure confidence), Arc (thoughtful information architecture), Raycast (fast, focused, keyboard-first).

**Anti-reference brands**: Salesforce (bloated, corporate, feature-count marketing), Jira (complex UI, enterprise cruft, configuration over convention).

**Direction**: The site should feel like a well-organized engineering notebook — clean, scannable, code-heavy, with the prose serving the examples rather than the other way around. The live preview component is the signature interaction: XML on the left, rendered output on the right. Everything else supports getting to that moment of understanding. No decoration. No hero illustrations. No gradients in the documentation. The authority comes from the content, not the chrome.
