-- Provenance foundation: reference_sources catalog + source_id FK on spec_content.
-- Idempotent: safe to run against fresh installs (matches db/schema.sql) or existing DBs.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS reference_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  edition TEXT,
  version TEXT,
  url TEXT,
  license_note TEXT,
  sha256 TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE spec_content
  ADD COLUMN IF NOT EXISTS source_id INT REFERENCES reference_sources(id);

CREATE INDEX IF NOT EXISTS idx_content_source ON spec_content(source_id);
