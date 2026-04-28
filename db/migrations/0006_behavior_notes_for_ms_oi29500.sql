-- Prepare behavior_notes for MS-OI29500 ingest.
--
-- Four classes of change, all idempotent:
--
-- 1. Survive XSD re-ingest. The original FK on symbol_id used ON DELETE
--    CASCADE; a future xsd:ingest run that drops a symbol would also wipe
--    every behavior_note attached to it. Switch to ON DELETE SET NULL.
--    Orphaned notes are reattachable by re-running ms:ingest --resolve-only.
--
-- 2. Citation columns for imported sources. MS-OI29500 entries live at
--    `<base>/<guid>` URLs; we store the GUID as `source_anchor` and the
--    lettered claim label (a, b, c, …) as `claim_label`. `claim_index` is a
--    fallback for pages without lettered groups. `target_ref` records the
--    schema target when symbol_id is NULL (vocab not ingested, ambiguous,
--    no-match).
--
-- 3. Two-sided claim text. MS-OI29500 always frames a claim as "spec says X"
--    + "Word does Y". We keep both sides in `standard_text` /
--    `behavior_text` rather than collapsing into `summary`. `summary` stays
--    as a renderable short form for tool output.
--
-- 4. Two new claim_type values. `varies_from_spec` is a generic divergence
--    that doesn't fit the existing six verbs; better than mis-classifying
--    as `writes` with low confidence. `does_not_support` covers Word's
--    common "does not support this attribute" pattern more precisely than
--    `ignores`.
--
-- A partial unique index on (source_id, source_anchor, claim_label or index)
-- is the natural key for upsert. Hand-curated rows (which won't have
-- source_anchor set) are excluded by the WHERE clause.

-- 1. Cascade behavior on symbol_id.
ALTER TABLE behavior_notes
  DROP CONSTRAINT IF EXISTS behavior_notes_symbol_id_fkey;
ALTER TABLE behavior_notes
  ADD CONSTRAINT behavior_notes_symbol_id_fkey
    FOREIGN KEY (symbol_id) REFERENCES xsd_symbols(id) ON DELETE SET NULL;

-- 2. Citation + identity columns.
ALTER TABLE behavior_notes
  ADD COLUMN IF NOT EXISTS source_anchor TEXT,
  ADD COLUMN IF NOT EXISTS claim_label   TEXT,
  ADD COLUMN IF NOT EXISTS claim_index   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_ref    TEXT;

-- 3. Two-sided claim text + parser confidence.
ALTER TABLE behavior_notes
  ADD COLUMN IF NOT EXISTS standard_text         TEXT,
  ADD COLUMN IF NOT EXISTS behavior_text         TEXT,
  ADD COLUMN IF NOT EXISTS resolution_confidence TEXT;

ALTER TABLE behavior_notes
  DROP CONSTRAINT IF EXISTS behavior_notes_resolution_confidence_check;
ALTER TABLE behavior_notes
  ADD CONSTRAINT behavior_notes_resolution_confidence_check
    CHECK (resolution_confidence IS NULL
        OR resolution_confidence IN ('high', 'medium', 'low'));

-- 4. Extended claim_type enum.
ALTER TABLE behavior_notes
  DROP CONSTRAINT IF EXISTS behavior_notes_claim_type_check;
ALTER TABLE behavior_notes
  ADD CONSTRAINT behavior_notes_claim_type_check
    CHECK (claim_type IN (
      'ignores',
      'requires_despite_optional',
      'writes',
      'reads_but_does_not_write',
      'repairs',
      'layout_behavior',
      'does_not_support',
      'varies_from_spec'
    ));

-- Natural-key unique index for upsert. claim_label is the preferred
-- discriminator (the a/b/c letter on the source page); claim_index is the
-- fallback when a page has no lettered groups. The partial WHERE clause
-- skips hand-curated rows that don't carry source_anchor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_behavior_notes_natural_key
  ON behavior_notes (
    source_id,
    source_anchor,
    COALESCE(claim_label, claim_index::text)
  )
  WHERE source_id IS NOT NULL AND source_anchor IS NOT NULL;
