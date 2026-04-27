-- Preserve element/attribute @type and group-ref compositor context so the
-- structural lookup tools can resolve element-to-type chains and attach refs
-- to their enclosing compositor.
-- Idempotent.

ALTER TABLE xsd_symbols
	ADD COLUMN IF NOT EXISTS type_ref TEXT;

ALTER TABLE xsd_group_edges
	ADD COLUMN IF NOT EXISTS compositor_id INT REFERENCES xsd_compositors(id) ON DELETE CASCADE,
	ADD COLUMN IF NOT EXISTS min_occurs INT DEFAULT 1,
	ADD COLUMN IF NOT EXISTS max_occurs INT;
