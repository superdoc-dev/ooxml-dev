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

-- ----------------------------------------------------------------------------
-- XSD schema graph
--
-- Profile-scoped symbol graph for OOXML schemas. Canonical symbol identity is
-- (vocabulary_id, local_name, kind, parent_symbol_id); namespace URIs are
-- profile aliases. Profile membership lives on edges/profile join tables, not
-- duplicated symbols.
-- ----------------------------------------------------------------------------

CREATE TABLE xsd_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE xsd_namespaces (
  id SERIAL PRIMARY KEY,
  uri TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- type_ref holds the Clark-style {namespace}localName for elements and attributes
-- that declare a @type. NULL for complexType/simpleType/group/attributeGroup.
-- The lookup tools follow type_ref to resolve element -> type when reading children.
--
-- parent_symbol_id is NULL for top-level declarations and set to the owning
-- type/group symbol for inline (local) element declarations. The canonical
-- key is 4-tuple with NULLS NOT DISTINCT so top-level decls still collide on
-- name while local decls remain scoped per-owner.
CREATE TABLE xsd_symbols (
  id SERIAL PRIMARY KEY,
  vocabulary_id TEXT NOT NULL,
  local_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  type_ref TEXT,
  parent_symbol_id INT REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT xsd_symbols_canonical_key
    UNIQUE NULLS NOT DISTINCT (vocabulary_id, local_name, kind, parent_symbol_id)
);

CREATE TABLE xsd_symbol_profiles (
  id SERIAL PRIMARY KEY,
  symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  namespace_id INT NOT NULL REFERENCES xsd_namespaces(id),
  source_id INT REFERENCES reference_sources(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol_id, profile_id)
);

-- Exactly one of parent_symbol_id (top-level) or parent_compositor_id (nested) is set.
CREATE TABLE xsd_compositors (
  id SERIAL PRIMARY KEY,
  parent_symbol_id INT REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  parent_compositor_id INT REFERENCES xsd_compositors(id) ON DELETE CASCADE,
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sequence', 'choice', 'all')),
  min_occurs INT DEFAULT 1,
  max_occurs INT,
  order_index INT DEFAULT 0,
  CHECK ((parent_symbol_id IS NOT NULL) <> (parent_compositor_id IS NOT NULL))
);

CREATE TABLE xsd_child_edges (
  id SERIAL PRIMARY KEY,
  parent_symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  compositor_id INT NOT NULL REFERENCES xsd_compositors(id) ON DELETE CASCADE,
  child_symbol_id INT NOT NULL REFERENCES xsd_symbols(id),
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  min_occurs INT DEFAULT 1,
  max_occurs INT,
  order_index INT DEFAULT 0
);

CREATE TABLE xsd_attr_edges (
  id SERIAL PRIMARY KEY,
  symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  attr_symbol_id INT REFERENCES xsd_symbols(id),
  local_name TEXT NOT NULL,
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  attr_use TEXT NOT NULL CHECK (attr_use IN ('required', 'optional', 'prohibited')) DEFAULT 'optional',
  default_value TEXT,
  fixed_value TEXT,
  type_ref TEXT,
  order_index INT DEFAULT 0
);

-- compositor_id is the enclosing compositor when a <xsd:group ref> appears inside
-- a sequence/choice/all (NULL for refs at the type's top level or for
-- attributeGroup refs which don't live in a compositor).
-- min/max_occurs capture the ref site's own cardinality.
CREATE TABLE xsd_group_edges (
  id SERIAL PRIMARY KEY,
  parent_symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  compositor_id INT REFERENCES xsd_compositors(id) ON DELETE CASCADE,
  group_symbol_id INT NOT NULL REFERENCES xsd_symbols(id),
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('group', 'attributeGroup')),
  resolved BOOLEAN DEFAULT FALSE,
  min_occurs INT DEFAULT 1,
  max_occurs INT,
  order_index INT DEFAULT 0
);

CREATE TABLE xsd_inheritance_edges (
  id SERIAL PRIMARY KEY,
  symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  base_symbol_id INT NOT NULL REFERENCES xsd_symbols(id),
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('extension', 'restriction')),
  UNIQUE (symbol_id, profile_id)
);

CREATE TABLE xsd_enums (
  id SERIAL PRIMARY KEY,
  symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
  profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  annotation TEXT,
  order_index INT DEFAULT 0
);

-- behavior_notes: editorial / imported claims about how an app behaves vs the
-- spec. symbol_id is ON DELETE SET NULL so notes survive XSD re-ingest.
-- source_anchor + claim_label form the natural key for imported rows
-- (currently MS-OI29500); hand-curated rows leave them NULL and use
-- alternative identification (note_key et al. as that path develops).
CREATE TABLE behavior_notes (
  id SERIAL PRIMARY KEY,
  symbol_id INT REFERENCES xsd_symbols(id) ON DELETE SET NULL,
  app TEXT NOT NULL,
  version_scope TEXT,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'ignores',
    'requires_despite_optional',
    'writes',
    'reads_but_does_not_write',
    'repairs',
    'layout_behavior',
    'does_not_support',
    'varies_from_spec'
  )),
  summary TEXT NOT NULL,
  source_id INT REFERENCES reference_sources(id),
  section_id TEXT,
  -- `confidence` is editorial: how sure are we the claim is TRUE? Imported
  -- rows from authoritative sources (MS-OI29500) get 'high'; hand-curated
  -- rows can hedge.
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  -- Imported-source citation:
  source_anchor TEXT,           -- e.g. MS-OI29500 page GUID
  source_commit TEXT,           -- per-row provenance: git_commit_id from the source page
  claim_label TEXT,             -- 'a', 'b', 'c', ... when present on source
  claim_index INT NOT NULL DEFAULT 0,
  target_ref TEXT,              -- fallback citation when symbol_id is NULL
  -- Two-sided claim text from the source (kept verbatim alongside `summary`).
  standard_text TEXT,
  behavior_text TEXT,
  -- `resolution_confidence` is mechanical: how sure is the parser+resolver
  -- about the EXTRACTION (claim_type classification + symbol attachment)?
  -- Distinct from `confidence` above. For imported rows: min of (claim_type
  -- classifier confidence, symbol resolver confidence).
  resolution_confidence TEXT CHECK (resolution_confidence IS NULL
                                 OR resolution_confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Natural-key unique index for upserting imported rows. claim_index encodes
-- (claimIdx * 100 + behaviorIdx) at ingest time so it's unique per
-- (source, page) - claim_label is shared across behaviors in a single claim
-- group and would collide here.
CREATE UNIQUE INDEX idx_behavior_notes_natural_key
  ON behavior_notes (source_id, source_anchor, claim_index)
  WHERE source_id IS NOT NULL AND source_anchor IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Verification layer: ground-truth observations from authored Word fixtures.
--
-- behavior_notes are claims Microsoft has DOCUMENTED. Word's actual behavior
-- can confirm, refine, contradict, or fail to reproduce them. word_fixtures
-- + word_observations + behavior_note_observations capture that ground
-- truth so the MCP can rank verified rows above unverified ones.
-- ----------------------------------------------------------------------------

CREATE TABLE word_fixtures (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sha256 TEXT,
  generator_script TEXT,
  word_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE word_observations (
  id SERIAL PRIMARY KEY,
  fixture_id INT REFERENCES word_fixtures(id) ON DELETE CASCADE,
  scenario TEXT NOT NULL,
  finding TEXT NOT NULL,
  before_xml TEXT,
  after_xml TEXT,
  observed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE behavior_note_observations (
  id SERIAL PRIMARY KEY,
  behavior_note_id INT NOT NULL REFERENCES behavior_notes(id) ON DELETE CASCADE,
  observation_id INT NOT NULL REFERENCES word_observations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'confirmed', 'refined', 'contradicted', 'not_reproducible'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (behavior_note_id, observation_id)
);

CREATE INDEX idx_word_observations_fixture ON word_observations(fixture_id);
CREATE INDEX idx_behavior_note_observations_note ON behavior_note_observations(behavior_note_id);
CREATE INDEX idx_behavior_note_observations_obs ON behavior_note_observations(observation_id);

CREATE INDEX idx_xsd_symbols_lookup ON xsd_symbols(vocabulary_id, local_name, kind);
CREATE INDEX idx_xsd_symbols_parent ON xsd_symbols(parent_symbol_id);
CREATE INDEX idx_xsd_child_edges_parent ON xsd_child_edges(parent_symbol_id);
CREATE INDEX idx_xsd_child_edges_compositor ON xsd_child_edges(compositor_id);
CREATE INDEX idx_xsd_attr_edges_symbol ON xsd_attr_edges(symbol_id);
CREATE INDEX idx_xsd_compositors_parent_symbol ON xsd_compositors(parent_symbol_id);
CREATE INDEX idx_xsd_compositors_parent_compositor ON xsd_compositors(parent_compositor_id);
CREATE INDEX idx_xsd_group_edges_parent ON xsd_group_edges(parent_symbol_id);
CREATE INDEX idx_xsd_inheritance_edges_symbol ON xsd_inheritance_edges(symbol_id);
CREATE INDEX idx_xsd_enums_symbol ON xsd_enums(symbol_id);
CREATE INDEX idx_behavior_notes_symbol ON behavior_notes(symbol_id);
