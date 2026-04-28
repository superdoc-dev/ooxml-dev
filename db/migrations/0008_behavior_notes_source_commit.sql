-- Add `source_commit` to behavior_notes for per-row provenance.
--
-- The MS-OI29500 ingest fetches Microsoft Learn markdown, which is mutable
-- (Microsoft can revise an individual page without bumping the doc-level
-- revision number). The pinned PDF in `reference_sources` covers the doc as
-- a whole, but doesn't tell us which exact commit of which Learn page we
-- parsed.
--
-- Each Learn page's YAML frontmatter exposes `git_commit_id` for the
-- backing markdown file. Recording that here makes a re-ingest reproducible
-- (same input commits → same output rows) and lets reviewers diff the
-- exact source state we ingested.
--
-- Hand-curated rows leave it NULL.

ALTER TABLE behavior_notes
  ADD COLUMN IF NOT EXISTS source_commit TEXT;
