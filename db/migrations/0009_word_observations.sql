-- Add the verification layer for behavior_notes.
--
-- behavior_notes (from MS-OI29500) are Microsoft-DOCUMENTED claims about
-- Office behavior. They are not necessarily what Word actually does — we
-- verified during Phase 4 dogfooding that the docs are directionally
-- accurate but glossed over critical edge cases (e.g. on `<w:trHeight
-- w:val="0" w:hRule="exact"/>`, MS-OI29500 says "Word requires val != 0"
-- but Word silently strips the entire trHeight on save).
--
-- The three new tables let us record ground-truth observations from
-- authored Word fixtures and tie them back to the documented claims:
--
--   word_fixtures              one row per .docx the Word API generated.
--                              Includes sha256, generator script, and
--                              Word version so observations are
--                              reproducible.
--
--   word_observations          one row per "Word does X with input Y"
--                              finding. Stores the relevant XML fragment
--                              before and after the operation that
--                              triggered the observation.
--
--   behavior_note_observations join table linking notes to observations
--                              with a verification status. A single note
--                              can have multiple observations (different
--                              Word versions or input shapes); the join
--                              row is the unit that carries
--                              confirmed / refined / contradicted /
--                              not_reproducible.
--
-- Idempotent. Re-running is a no-op.

CREATE TABLE IF NOT EXISTS word_fixtures (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,            -- e.g. 'arabic-bold-test'
  description TEXT,
  sha256 TEXT,                          -- of the .docx blob
  generator_script TEXT,                -- PowerShell or 'create_document(...)' call
  word_version TEXT,                    -- e.g. 'Word 16.0'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS word_observations (
  id SERIAL PRIMARY KEY,
  fixture_id INT REFERENCES word_fixtures(id) ON DELETE CASCADE,
  scenario TEXT NOT NULL,               -- 'authored', 'open-and-save', 'open-and-render'
  finding TEXT NOT NULL,                -- short prose finding
  before_xml TEXT,                      -- relevant fragment before
  after_xml TEXT,                       -- relevant fragment after
  observed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS behavior_note_observations (
  id SERIAL PRIMARY KEY,
  behavior_note_id INT NOT NULL REFERENCES behavior_notes(id) ON DELETE CASCADE,
  observation_id INT NOT NULL REFERENCES word_observations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'confirmed',          -- Word's behavior matches the documented claim.
    'refined',            -- Claim is directionally true but the actual
                          -- behavior is more specific (e.g. doc says
                          -- "Word requires X" but Word's repair path is
                          -- to silently strip the directive).
    'contradicted',       -- Claim is wrong as written; Word does
                          -- something different.
    'not_reproducible'    -- Could not reproduce the documented behavior
                          -- in the fixture.
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (behavior_note_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_word_observations_fixture
  ON word_observations(fixture_id);
CREATE INDEX IF NOT EXISTS idx_behavior_note_observations_note
  ON behavior_note_observations(behavior_note_id);
CREATE INDEX IF NOT EXISTS idx_behavior_note_observations_obs
  ON behavior_note_observations(observation_id);
