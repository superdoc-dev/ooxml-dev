-- Drop the legacy `ecma-376` placeholder source row.
--
-- An earlier version of data/sources.json had a single placeholder
-- (`ecma-376`, edition=unknown, sha256=null) that stood in for the whole
-- spec corpus before per-part entries existed. The manifest now pins the
-- four ECMA-376 parts individually (`ecma-376-partN`), so the placeholder
-- is obsolete.
--
-- This migration only deletes the row when nothing in spec_content
-- references it, so a developer who already backfilled source_id to the
-- legacy id stays safe. Idempotent.

DELETE FROM reference_sources
WHERE name = 'ecma-376'
  AND NOT EXISTS (
    SELECT 1 FROM spec_content WHERE spec_content.source_id = reference_sources.id
  );
