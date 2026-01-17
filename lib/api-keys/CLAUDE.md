# API Keys Module

## Domain Purpose
User-scoped API key retrieval and decryption with automatic environment variable fallback. Supports dual-auth (session + API token).

## Module Boundaries
- **Owns**: Key decryption, provider mapping, fallback logic, caching strategy
- **Delegates to**: `lib/crypto.ts` for AES-256-CBC decryption, `lib/session/get-server-session.ts` for session resolution, `lib/db/` for key queries

## Local Patterns
- **Key Priority**: User-stored key > System env var (never both; user always overrides)
- **Provider Types**: openai, gemini, cursor, anthropic, aigateway
- **Internal Helper**: `_fetchKeysFromDatabase()` is private implementation detail (JSDoc marked @private)
- **Dual-Auth Support**: Function accepts optional `userId` for API token auth; falls back to session if absent
- **Error Handling**: Catch decryption/query errors; silently return env vars on failure (no throw)

## Integration Points
- `lib/sandbox/agents/` - Fetch user keys before agent execution
- `app/api/tasks/` - Get keys for selectedAgent before task processing
- `lib/mcp/tools/create-task.ts` - Retrieve user keys for MCP task execution
- `app/api/api-keys/` - CRUD for key management UI

## Key Files
- `user-keys.ts` - `getUserApiKeys()`, `getUserApiKey()`, internal `_fetchKeysFromDatabase()`
