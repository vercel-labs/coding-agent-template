# app/api/connectors - MCP Server Management

Manages Model Context Protocol (MCP) server configuration, encryption, and user access. Handles local/remote MCP connections with encrypted environment variables.

## Domain Purpose
CRUD for MCP server connectors: configure local CLI commands and remote HTTP endpoints with encrypted env vars and OAuth credentials. Enables Claude agent to use extended tools via MCP during task execution.

## Routes

### GET /api/connectors
- Fetch all user's MCP connectors
- Auth: Session-based (getSessionFromReq)
- Returns: Decrypted array of connector objects

### POST /api/connectors (implied)
- Create new MCP connector
- Configure: type (local/remote), name, description
- Env vars: Encrypted before storage
- OAuth secrets: Encrypted before storage

### PATCH/DELETE (implied)
- Update connector configuration
- Delete connector by ID

## Connector Object

```typescript
interface Connector {
  id: string                      // Unique identifier
  userId: string                  // User ownership
  type: 'local' | 'remote'       // Local CLI or HTTP endpoint
  name: string                    // Display name
  description?: string            // What it does
  status: 'connected' | 'error' | 'disconnected'

  // Local CLI type
  command?: string                // e.g., "npx my-tool"
  args?: string[]                 // Command arguments

  // Remote HTTP type
  url?: string                    // HTTP endpoint

  // Both types
  env: Record<string, string>    // Encrypted env vars (encrypted as JSON text)
  oauthClientSecret?: string     // Encrypted OAuth secret (if using OAuth)
  oauthClientId?: string         // OAuth client ID (not encrypted)

  createdAt: Date
  updatedAt: Date
}
```

## Key Patterns

### Encryption/Decryption
```typescript
// Storage (encrypts as single blob)
const encryptedEnv = encrypt(JSON.stringify(env))
await db.insert(connectors).values({ env: encryptedEnv, ... })

// Retrieval (decrypts and parses)
const decryptedConnectors = userConnectors.map((connector) => ({
  ...connector,
  env: connector.env ? JSON.parse(decrypt(connector.env)) : null,
  oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
}))
```

### User Scoping
```typescript
const userConnectors = await db
  .select()
  .from(connectors)
  .where(eq(connectors.userId, session.user.id))
```

## Integration with Task Execution

### During Task Processing
1. Fetch user's connected MCP servers (filter by `status: 'connected'`)
2. Decrypt env vars + OAuth secrets
3. Pass to `executeAgentInSandbox()`
4. Agent CLI loads MCP servers for tool access
5. Store `mcpServerIds` in task record for history

### Error Handling
- If MCP fetch fails: Log warning, continue without MCP servers
- If decryption fails: Return `500` error
- User scoping prevents cross-user connector access

## Database Table

### connectors
- PK: `id`
- FK: `userId` (user ownership)
- Type: `'local'` or `'remote'`
- Encrypted fields: `env`, `oauthClientSecret`
- Status tracking: `'connected'`, `'error'`, `'disconnected'`
- Timestamps: `createdAt`, `updatedAt`

## MCP Server Types

### Local MCP Servers
- Type: `'local'`
- Run locally on CLI: `command` + optional `args`
- Example: `npx my-tool --option value`
- Common: Developer tools, linters, custom scripts

### Remote MCP Servers
- Type: `'remote'`
- HTTP endpoint: `url` field
- Example: `https://mcp-server.example.com/`
- Common: Third-party services, cloud tools

## Security Notes
- All env vars encrypted at rest (single string blob)
- OAuth secrets never logged (encrypted storage only)
- User-scoped: No cross-user connector access
- Decryption happens server-side only
- Error messages static (no env var exposure)

## Authentication
- Session-based (`getSessionFromReq`)
- Not available via Bearer tokens (API tokens)
- Only accessible to authenticated web UI users

## Integration Points
- **Crypto**: `encrypt()/decrypt()` from `@/lib/crypto`
- **Database**: `connectors` table in schema
- **Task Execution**: `@/lib/sandbox/agents/claude.ts` receives decrypted list
- **UI**: `components/` likely has connector management UI

## UI Features (Implied)
- Add/edit/delete MCP connectors
- Test connection status
- View encrypted env vars (masked)
- OAuth setup wizard
- Status indicator (connected, error, disconnected)
