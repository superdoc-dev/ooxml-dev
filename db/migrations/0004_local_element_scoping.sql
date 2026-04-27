-- Scope local element symbols by their owner.
--
-- Before this migration, an inline <xsd:element name="X" type="..."/> declared
-- inside two different complexTypes/groups collapsed to a single symbol keyed
-- on (vocabulary_id, local_name, kind). The first-seen type_ref won and the
-- later one was silently dropped, so e.g. WML's `tblGrid` (CT_TblGridBase
-- inside CT_TblGridChange vs CT_TblGrid inside CT_Tbl) gave a wrong answer
-- for ooxml_children("w:tblGrid").
--
-- Fix: add parent_symbol_id to xsd_symbols and include it in the canonical key
-- with NULLS NOT DISTINCT so two top-level declarations (parent NULL) still
-- collide while local declarations are scoped per-owner.
--
-- Idempotent.

ALTER TABLE xsd_symbols
	ADD COLUMN IF NOT EXISTS parent_symbol_id INT REFERENCES xsd_symbols(id) ON DELETE CASCADE;

DO $$
DECLARE cname TEXT;
BEGIN
	-- Drop the auto-named 3-tuple unique constraint, regardless of what postgres
	-- ended up calling it.
	SELECT conname INTO cname
	FROM pg_constraint
	WHERE conrelid = 'xsd_symbols'::regclass
	  AND contype = 'u'
	  AND conkey = (
	    SELECT array_agg(attnum ORDER BY attnum)
	    FROM pg_attribute
	    WHERE attrelid = 'xsd_symbols'::regclass
	      AND attname IN ('vocabulary_id', 'local_name', 'kind')
	  );
	IF cname IS NOT NULL THEN
		EXECUTE 'ALTER TABLE xsd_symbols DROP CONSTRAINT ' || quote_ident(cname);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'xsd_symbols_canonical_key'
		  AND conrelid = 'xsd_symbols'::regclass
	) THEN
		ALTER TABLE xsd_symbols
			ADD CONSTRAINT xsd_symbols_canonical_key
			UNIQUE NULLS NOT DISTINCT (vocabulary_id, local_name, kind, parent_symbol_id);
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_xsd_symbols_parent ON xsd_symbols(parent_symbol_id);
