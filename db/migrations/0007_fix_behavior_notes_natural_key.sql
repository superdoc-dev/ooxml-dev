-- Fix the natural-key unique index for imported behavior_notes.
--
-- 0006 created an index keyed on `COALESCE(claim_label, claim_index::text)`,
-- which assumed claim_label discriminated rows. It doesn't: a single claim
-- group on an MS-OI29500 page can have multiple behavior bullets that all
-- share the same letter (e.g. claim "i" with three "Word does X" bullets).
-- The COALESCE collapses them to one key.
--
-- The right discriminator is `claim_index`, which the ingest builds as
-- `claimIdx * 100 + behaviorIdx` and is unique per page. claim_label stays
-- as an informational column for display.
--
-- Idempotent: drop the old index, create the new one. Both `IF EXISTS` /
-- `IF NOT EXISTS` guards make re-running safe.

DROP INDEX IF EXISTS idx_behavior_notes_natural_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_behavior_notes_natural_key
  ON behavior_notes (source_id, source_anchor, claim_index)
  WHERE source_id IS NOT NULL AND source_anchor IS NOT NULL;
