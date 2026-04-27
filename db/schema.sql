-- ooxml.dev database schema
-- Single source of truth for fresh installs (loaded by docker-compose at init).
-- For incremental updates against an existing DB, apply files in db/migrations/ in order.

CREATE EXTENSION IF NOT EXISTS vector;

-- Reference sources: provenance for every chunk and (later) every schema symbol.
-- Source artifacts (PDFs, XSDs) are NOT committed. Manifest at data/sources.json
-- is the human-edited source of truth; scripts/sync-sources.ts upserts rows from it.
-- name is the stable identity. edition/version are updatable attributes:
-- when 'unknown' is later verified to '5th', we update in place rather than
-- inserting a duplicate row that would orphan existing source_id references.
-- To track multiple editions side-by-side, use distinct names ('ecma-376-4th').
CREATE TABLE reference_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,    -- stable id, e.g. 'ecma-376'
  kind TEXT NOT NULL,           -- 'spec_pdf', 'xsd', 'reference_doc'
  edition TEXT,                 -- '4th', '5th', or 'unknown' until verified
  version TEXT,                 -- semver / date / null
  url TEXT,                     -- canonical fetch URL
  license_note TEXT,            -- redistribution constraint
  sha256 TEXT,                  -- artifact hash if fetched
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Specification content: prose chunks for semantic search
CREATE TABLE spec_content (
  id SERIAL PRIMARY KEY,
  part_number INT NOT NULL,
  section_id TEXT,
  title TEXT,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  page_number INT,
  embedding vector(1024),
  source_id INT REFERENCES reference_sources(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_embedding ON spec_content USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_content_part ON spec_content(part_number);
CREATE INDEX idx_content_section ON spec_content(section_id);
CREATE INDEX idx_content_source ON spec_content(source_id);
