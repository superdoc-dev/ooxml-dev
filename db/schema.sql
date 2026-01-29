-- ECMA-376 Spec Vector Database Schema
-- Simple single-table design - evolve as needed

CREATE EXTENSION IF NOT EXISTS vector;

-- Single table for all spec content
CREATE TABLE spec_content (
  id SERIAL PRIMARY KEY,
  part_number INT NOT NULL,
  section_id TEXT,
  title TEXT,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  page_number INT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity search
CREATE INDEX idx_content_embedding ON spec_content USING hnsw (embedding vector_cosine_ops);

-- Filtering indexes
CREATE INDEX idx_content_part ON spec_content(part_number);
CREATE INDEX idx_content_section ON spec_content(section_id);
