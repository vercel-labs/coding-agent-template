# app/api/connectors

MCP server CRUD: configure local CLI commands and remote HTTP endpoints with encrypted env vars/OAuth secrets.

## Domain Purpose
- Enable users to configure MCP servers (local CLI or HTTP endpoints)
- Encrypt env vars and OAuth secrets at rest
- Pass decrypted connectors to agents during task execution

## Local Patterns
- **Encryption pattern**: `encrypt(JSON.stringify(env))` on storage; `JSON.parse(decrypt(env))` on retrieval
- **Session-only**: `getSessionFromReq(request)`, not available via Bearer tokens
- **User-scoped**: All queries filter by userId
- **Connector types**: `'local'` (CLI command) or `'remote'` (HTTP endpoint)

## Routes
- `GET /api/connectors` - List user's connectors (decrypted)
- `POST /api/connectors` - Create connector (encrypts env vars + secrets)
- `PATCH /api/connectors/[id]` - Update connector
- `DELETE /api/connectors/[id]` - Delete connector

## Integration Points
- **Crypto**: `@/lib/crypto` (encrypt/decrypt)
- **Database**: `connectors` table (userId FK, type, env, secrets)
- **Task Execution**: Decrypted list passed to `@/lib/sandbox/agents/claude.ts`
- **UI**: Connector management components

## Connector Object
- `id`, `userId`, `type` ('local'|'remote'), `name`, `description`
- `command`, `args` (local), `url` (remote)
- `env` (encrypted JSON), `oauthClientSecret` (encrypted), `oauthClientId`
- `status` ('connected'|'error'|'disconnected'), `createdAt`, `updatedAt`

## Key Files
- `route.ts` - GET/POST for listing and creating connectors
- Decryption only on read; encryption on write
