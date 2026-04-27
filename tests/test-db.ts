/**
 * Shared database guard for integration tests.
 *
 * The test suites TRUNCATE xsd_* tables aggressively (TRUNCATE ... CASCADE) and
 * delete from spec_content's foreign-key sphere. They MUST NOT run against any
 * non-local Postgres - in particular, never against a Neon production URL.
 *
 * Rules:
 *   1. TEST_DATABASE_URL must be set explicitly. There is no fallback to
 *      DATABASE_URL: a developer who accidentally has DATABASE_URL pointed at
 *      Neon would otherwise wipe their schema graph data on `bun test`.
 *   2. The hostname in TEST_DATABASE_URL must be local
 *      (localhost / 127.0.0.1 / host.docker.internal).
 *
 * If either rule fails, throw and refuse to run.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);

export function getTestDatabaseUrl(): string {
	const url = process.env.TEST_DATABASE_URL;
	if (!url) {
		throw new Error(
			"TEST_DATABASE_URL is not set. Integration tests TRUNCATE xsd_* tables and refuse to run without an explicit test database URL. Example: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ecma_spec",
		);
	}

	// Extract hostname from a postgres connection string. Avoid `new URL()` on
	// `postgresql://` because some Node URL parsers reject the scheme.
	const hostMatch = url.match(/@([^/:?]+)/);
	const host = (hostMatch?.[1] ?? "").toLowerCase();
	if (!LOCAL_HOSTS.has(host)) {
		throw new Error(
			`TEST_DATABASE_URL hostname '${host}' is not a local host. Refusing to TRUNCATE against a non-local database. Allowed hosts: ${[...LOCAL_HOSTS].join(", ")}.`,
		);
	}
	return url;
}
