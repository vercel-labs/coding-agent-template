# Database Module

## Domain Purpose
Manage PostgreSQL schema, type-safe queries, and data models for users, tasks, authentication, and MCP servers.

## Key Responsibilities
- **Schema Definition**: Define all tables with Zod validation schemas (insert/select)
- **Type Safety**: Export TypeScript types inferred from Zod schemas
- **Lazy Connection**: Proxy pattern ensures db connection only created on first query
- **Migrations**: Store and run migrations via drizzle-kit (workaround: `cp .env.local .env`)
- **Encryption Integration**: Keys/OAuth tokens encrypted before storage via `lib/crypto.ts`
- **User Isolation**: All tables filtered by userId; enforce foreign key constraints

## Module Boundaries
- **Delegates to**: `lib/crypto.ts` for encryption/decryption
- **Delegates to**: drizzle-orm for ORM operations
- **Owned**: Schema definition, connection pooling, migration metadata

## Core Tables
- **users** - User profiles with OAuth provider info (encrypted tokens)
- **accounts** - Additional linked accounts (e.g., GitHub connected to Vercel user)
- **keys** - User API keys for external services (anthropic, openai, cursor, gemini, aigateway) - encrypted
- **tasks** - Coding tasks with status, logs (JSONB), PR info, branch name
- **taskMessages** - Chat history (user/agent messages) for multi-turn conversations
- **connectors** - MCP server configurations (local stdio or remote HTTP) - encrypted env vars
- **settings** - Key-value pairs for user overrides (maxMessagesPerDay, etc.)
- **apiTokens** - External API tokens (hashed) for programmatic access

## Local Patterns
- **Encryption**: OAuth tokens, API keys, MCP env vars all encrypted at rest
- **User Foreign Keys**: All queries MUST filter by userId (prevent cross-user access)
- **Zod Schemas**: Every table has insertXSchema, selectXSchema, Type exports
- **JSONB Logs**: LogEntry[] stored in tasks.logs for real-time updates
- **Unique Constraints**: users (provider + externalId), keys (userId + provider), accounts (userId + provider)
- **Soft Deletes**: Tasks have deletedAt column (used in rate limiting to exclude soft-deleted)

## Database Connection
```typescript
// Lazy-loaded via Proxy pattern
// First query to db: creates postgres client + drizzle instance
// JIT compilation prevents connection until first use
```

## Local Configuration (Critical)
- **POSTGRES_URL**: Supabase connection string (required)
- **ENCRYPTION_KEY**: Hex string (32 bytes = 64 chars) for AES-256-CBC
- **Drizzle Workaround**: Use `DOTENV_CONFIG_PATH=.env pnpm tsx` for migrations
  - Reason: drizzle-kit doesn't auto-load .env.local; requires .env

## Integration Points
- **app/api/auth/**: Create/update users, accounts on OAuth callback
- **app/api/tasks/**: Insert tasks, update logs, query by userId
- **app/api/api-keys/**: Get user's API keys (decrypted for CLI)
- **app/api/connectors/**: CRUD MCP server configs
- **app/api/tokens/**: Create/revoke API tokens; hash before storage
- **lib/sandbox/agents/**: Fetch user keys for agent execution
- **lib/utils/rate-limit.ts**: Count tasks/messages created today per user

## Files in This Module
- `client.ts` - Lazy-loaded db proxy; Drizzle instance
- `schema.ts` - All table definitions + Zod schemas (1000+ lines)
- `users.ts` - Helper queries for user lookups
- `settings.ts` - Get/set user settings (maxMessagesPerDay, etc.)

## Common Workflows
1. **Create Task**: Insert with userId, prompt, status='pending'
2. **Update Task Logs**: Fetch task → Append LogEntry to logs array → Update
3. **Stream Message**: Insert taskMessage with role='agent', content='' → Update content in real-time
4. **Store MCP Config**: Encrypt env vars → Insert connector with encrypted env
5. **Validate User Access**: Query by (taskId, userId) tuple; fail if mismatch

## Security Notes
- **Encryption at Rest**: OAuth tokens, API keys, MCP env vars all encrypted
- **User Isolation**: Foreign key constraints + userId filters prevent leakage
- **Token Hashing**: API tokens hashed with SHA256; raw token shown once at creation
- **Soft Deletes**: Deleted tasks excluded from rate limits (not hard-deleted for audit trail)
- **Connection Pool**: Postgres client reused across requests; thread-safe via Drizzle

## Gotchas & Edge Cases
- **Token Encryption**: Stored as "iv:hex:encrypted:hex"; decryption fails gracefully on corruption
- **Empty Logs**: logs JSONB can be null; code handles null coalescing
- **Circular Foreign Keys**: accounts references users.id but users primary is OAuth; no circular
- **Migration Timing**: Migrations run on Vercel deployment automatically (git push triggers)
- **Local Dev**: Must manually run migrations after schema changes (drizzle-kit workaround)
