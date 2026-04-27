# Migrations

Each phase that changes the schema adds one numbered SQL file here. Files are applied in lexical order (`0001_*.sql`, `0002_*.sql`, ...).

## Conventions

- **Idempotent**: every statement uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, or equivalent. Re-running a migration is a no-op.
- **Forward-only**: no `down` scripts. Reverting means writing a new migration.
- **Source of truth split**:
  - `db/schema.sql` reflects the full schema after all migrations are applied. Used by `docker-compose` to initialize fresh dev databases via `db:reset`.
  - Migration files are for incrementally upgrading existing databases (production / long-lived dev).

## Applying migrations

For now, apply manually against an existing database:

```bash
psql "$DATABASE_URL" -f db/migrations/0001_reference_sources.sql
```

A small runner script can be added later if/when phases need it.

## Adding a new migration

1. Pick the next number (`0002`, `0003`, ...).
2. Write idempotent SQL.
3. Update `db/schema.sql` to match the new full state.
4. If the migration introduces curated data (e.g., source rows), let a script populate it (e.g., `scripts/sync-sources.ts`), not the SQL file.
