# XSD ingest (ECMA-376 schema graph)

Builds the structural-query corpus that powers `ooxml_lookup_element`,
`ooxml_children`, `ooxml_attributes`, etc. The XSDs published by Ecma
International for ECMA-376 Transitional are parsed and persisted as a
profile-scoped relational graph.

```
ECMA Part 4 zip -> fetch + verify (sha256) -> parse (preserveOrder)
                -> ingest (single transaction) -> 11 tables in Postgres
```

## Prerequisites

- `DATABASE_URL` pointed at a Postgres with `db/schema.sql` applied
- A row in `reference_sources` named `ecma-376-transitional`. Run
  `bun run sources:sync` after editing `data/sources.json`.

## Fetch the schemas

The Part 4 zip is published on the ECMA-376 publications page. It contains
`OfficeOpenXML-XMLSchema-Transitional.zip`, which contains the 26
Transitional XSDs (`wml.xsd`, `dml-main.xsd`, `sml.xsd`, `pml.xsd`,
`shared-*.xsd`, ...).

```bash
bun run xsd:fetch \
  --url 'https://ecma-international.org/wp-content/uploads/ECMA-376-4_5th_edition_december_2016.zip' \
  --expected-sha256 'bd25da1109f73762356596918bf5ff8b74a1331642dba5f1c1d1dfc6bed34ecd'
```

The script verifies the outer-zip sha256, extracts the inner zip, and lands
the XSDs in `data/xsd-cache/ecma-376-transitional/`. The cache is gitignored;
nothing binary lands in the repo.

## Ingest

```bash
bun run xsd:ingest
```

By default it walks `wml.xsd` plus its import closure (12 documents) and
populates: `xsd_profiles`, `xsd_namespaces`, `xsd_symbols`,
`xsd_symbol_profiles`, `xsd_inheritance_edges`, `xsd_compositors`,
`xsd_child_edges`, `xsd_group_edges`, `xsd_attr_edges`, `xsd_enums`. Wraps
the whole thing in a single transaction; idempotent across runs.

To ingest a different working set:

```bash
bun run xsd:ingest --entrypoint dml-main.xsd
bun run xsd:ingest --schema-dir <path> --entrypoint <file> \
                   --profile <name> --source <reference_sources.name>
```

## Files

- `fetch.ts` - download Part 4 zip, verify sha256, extract XSDs
- `parse-schema.ts` - load XSDs into an in-memory schema set with ordered
  AST + namespace map + import graph + qname declaration index
- `vocabulary.ts` - canonical namespace URI -> vocabulary id map
- `qname.ts` - canonical-key + qname-attribute resolution
- `ast.ts` - helpers for walking fast-xml-parser preserveOrder output
- `types.ts` - shared types
- `ingest.ts` - parser output -> 11 DB tables, single transaction

## Smoke-test the result

```bash
bun run ooxml:call ooxml_children   '{"qname":"w:tbl"}'
bun run ooxml:call ooxml_attributes '{"qname":"w:pBdr"}'
bun run ooxml:call ooxml_enum       '{"qname":"w:ST_Jc"}'
```
