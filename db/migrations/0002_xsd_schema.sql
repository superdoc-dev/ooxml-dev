-- Phase 2: XSD schema tables (empty)
-- Profile-scoped symbol graph. All tables empty after this migration; data lands in Phase 3+.
-- Idempotent: safe to run against fresh installs (matches db/schema.sql) or existing DBs.

CREATE TABLE IF NOT EXISTS xsd_profiles (
	id SERIAL PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,         -- 'transitional', 'strict', 'office-extension', 'word-compatible-docx'
	description TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xsd_namespaces (
	id SERIAL PRIMARY KEY,
	uri TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canonical symbol identity: (vocabulary_id, local_name, kind).
-- vocabulary_id is a normalized id like 'wml-main', 'dml-main', 'shared-types'.
-- Namespace URIs are profile aliases, not part of identity (see xsd_symbol_profiles).
CREATE TABLE IF NOT EXISTS xsd_symbols (
	id SERIAL PRIMARY KEY,
	vocabulary_id TEXT NOT NULL,
	local_name TEXT NOT NULL,
	kind TEXT NOT NULL,                -- element, complexType, simpleType, attribute, attributeGroup, group
	payload JSONB DEFAULT '{}'::jsonb, -- long-tail XSD details (annotations, app-info, rare attrs)
	created_at TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE (vocabulary_id, local_name, kind)
);

-- Profile membership + per-profile namespace alias for a symbol.
CREATE TABLE IF NOT EXISTS xsd_symbol_profiles (
	id SERIAL PRIMARY KEY,
	symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
	namespace_id INT NOT NULL REFERENCES xsd_namespaces(id),
	source_id INT REFERENCES reference_sources(id),
	created_at TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE (symbol_id, profile_id)
);

-- Content-model compositors (xs:sequence | xs:choice | xs:all). Profile-scoped.
-- Exactly one of parent_symbol_id (top-level on a type/group) or
-- parent_compositor_id (nested inside another compositor) is set.
CREATE TABLE IF NOT EXISTS xsd_compositors (
	id SERIAL PRIMARY KEY,
	parent_symbol_id INT REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	parent_compositor_id INT REFERENCES xsd_compositors(id) ON DELETE CASCADE,
	profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('sequence', 'choice', 'all')),
	min_occurs INT DEFAULT 1,
	max_occurs INT,                    -- NULL = unbounded
	order_index INT DEFAULT 0,
	CHECK ((parent_symbol_id IS NOT NULL) <> (parent_compositor_id IS NOT NULL))
);

-- Child element edges. parent_symbol_id is denormalized for fast "children of X" queries
-- without walking through compositor rows first.
CREATE TABLE IF NOT EXISTS xsd_child_edges (
	id SERIAL PRIMARY KEY,
	parent_symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	compositor_id INT NOT NULL REFERENCES xsd_compositors(id) ON DELETE CASCADE,
	child_symbol_id INT NOT NULL REFERENCES xsd_symbols(id),
	profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
	min_occurs INT DEFAULT 1,
	max_occurs INT,                    -- NULL = unbounded
	order_index INT DEFAULT 0
);

-- Attribute edges. attr_symbol_id is set when the attribute is a top-level symbol
-- (declared globally and referenced by ref); NULL for inline attributes.
CREATE TABLE IF NOT EXISTS xsd_attr_edges (
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

-- Group / attributeGroup references. resolved=true means the group's contents
-- have been expanded into xsd_child_edges or xsd_attr_edges on the parent.
CREATE TABLE IF NOT EXISTS xsd_group_edges (
	id SERIAL PRIMARY KEY,
	parent_symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	group_symbol_id INT NOT NULL REFERENCES xsd_symbols(id),
	profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
	ref_kind TEXT NOT NULL CHECK (ref_kind IN ('group', 'attributeGroup')),
	resolved BOOLEAN DEFAULT FALSE,
	order_index INT DEFAULT 0
);

-- Inheritance: extension or restriction of a base type. A derived type has
-- exactly one base per profile.
CREATE TABLE IF NOT EXISTS xsd_inheritance_edges (
	id SERIAL PRIMARY KEY,
	symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	base_symbol_id INT NOT NULL REFERENCES xsd_symbols(id),
	profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
	relation TEXT NOT NULL CHECK (relation IN ('extension', 'restriction')),
	UNIQUE (symbol_id, profile_id)
);

-- Enum values from xs:simpleType / xs:restriction.
CREATE TABLE IF NOT EXISTS xsd_enums (
	id SERIAL PRIMARY KEY,
	symbol_id INT NOT NULL REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	profile_id INT NOT NULL REFERENCES xsd_profiles(id) ON DELETE CASCADE,
	value TEXT NOT NULL,
	annotation TEXT,
	order_index INT DEFAULT 0
);

-- Curated Word/Office behavior claims keyed to symbols.
-- claim_type enum is locked now (Phase 5 will populate).
CREATE TABLE IF NOT EXISTS behavior_notes (
	id SERIAL PRIMARY KEY,
	symbol_id INT REFERENCES xsd_symbols(id) ON DELETE CASCADE,
	app TEXT NOT NULL,                 -- 'Word', 'Office', 'LibreOffice'
	version_scope TEXT,                -- e.g. 'Word 2007+', 'Word 365'
	claim_type TEXT NOT NULL CHECK (claim_type IN (
		'ignores',
		'requires_despite_optional',
		'writes',
		'reads_but_does_not_write',
		'repairs',
		'layout_behavior'
	)),
	summary TEXT NOT NULL,
	source_id INT REFERENCES reference_sources(id),
	section_id TEXT,
	confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (UNIQUE constraints already create implicit indexes for canonical lookups)
CREATE INDEX IF NOT EXISTS idx_xsd_symbols_lookup ON xsd_symbols(vocabulary_id, local_name, kind);
CREATE INDEX IF NOT EXISTS idx_xsd_child_edges_parent ON xsd_child_edges(parent_symbol_id);
CREATE INDEX IF NOT EXISTS idx_xsd_child_edges_compositor ON xsd_child_edges(compositor_id);
CREATE INDEX IF NOT EXISTS idx_xsd_attr_edges_symbol ON xsd_attr_edges(symbol_id);
CREATE INDEX IF NOT EXISTS idx_xsd_compositors_parent_symbol ON xsd_compositors(parent_symbol_id);
CREATE INDEX IF NOT EXISTS idx_xsd_compositors_parent_compositor ON xsd_compositors(parent_compositor_id);
CREATE INDEX IF NOT EXISTS idx_xsd_group_edges_parent ON xsd_group_edges(parent_symbol_id);
CREATE INDEX IF NOT EXISTS idx_xsd_inheritance_edges_symbol ON xsd_inheritance_edges(symbol_id);
CREATE INDEX IF NOT EXISTS idx_xsd_enums_symbol ON xsd_enums(symbol_id);
CREATE INDEX IF NOT EXISTS idx_behavior_notes_symbol ON behavior_notes(symbol_id);
