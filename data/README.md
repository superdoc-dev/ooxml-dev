# data/

Repository data root. Three categories live here:

- **`sources.json`** (committed): canonical source manifest. One entry per
  artifact (ECMA-376 PDFs, ECMA Part 4 XSD zip, future MS-OI29500, etc.) with
  url, edition, sha256, and a license note. `bun run sources:sync` upserts these
  rows into the `reference_sources` table. Edit by hand; the sync script reads
  it.

- **`xsd-cache/`** (gitignored): local XSD download cache. Populated by
  `bun run xsd:fetch`. Contents are not load-bearing for the schema graph
  itself - the graph lives in Postgres - they're just the source artifacts
  the ingest reads. Safe to delete; regenerated on the next fetch.

- **`behavior-notes/`** (committed when populated): curated YAML files
  documenting how Microsoft Office actually behaves vs. the spec. A future
  ingest will load these into the `behavior_notes` table so structural tool
  responses can carry "what Word actually does" alongside the schema-level
  answer. Empty until that workflow lands.

What does NOT live here:

- Generated build output: `dist/`, `dev/data/extracted/`, `dev/data/chunks/`,
  `dev/data/embedded/` (all under `dev/`, gitignored).
- Database state: lives in Postgres; reproducible from the manifest +
  ingest scripts.
