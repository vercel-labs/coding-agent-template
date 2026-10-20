Run `pnpm test:parallel-search` for connector configuration and selection tests.
The tests use dummy model credentials and do not contact model or search providers.

For the PostgreSQL account lifecycle tests, create a disposable database, set
`PARALLEL_TEST_DATABASE_URL` to its connection string, and apply the schema with
`POSTGRES_URL="$PARALLEL_TEST_DATABASE_URL" pnpm db:push`. These tests create and
remove only their own fixture users and connectors.

To exercise the real Codex process against deterministic HTTP model and MCP
fixtures, install `@openai/codex` separately and set `CODEX_BIN` to its executable.
This covers search, fetch, result consumption, service errors, tool timeouts,
disabled MCP and process cancellation. It requires no model API key. The
PostgreSQL and native Codex cases report skips unless their respective variables
are set. Adapter configuration tests cover all six CLIs; native process tests
exercise Codex.

Set `OPENCODE_BIN` to a separately installed `opencode-ai` executable to verify
the actual global configuration loader and a manually disabled MCP entry. This
uses a local MCP HTTP fixture and no inference provider.
