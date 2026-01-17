# Database Module

## Domain Purpose
PostgreSQL schema definition, type-safe Drizzle ORM queries, lazy connection pooling, and Zod validation schemas.

## Module Boundaries
- **Owns**: Schema definitions, connection pooling, migration metadata, Zod validation
- **Delegates to**: `lib/crypto.ts` for encryption/decryption, drizzle-orm for ORM operations

## Local Patterns
- **Lazy Connection**: Proxy pattern; first query creates postgres client + drizzle instance (JIT)
- **User Foreign Keys**: ALL queries filter by `userId` (enforce via WHERE clause, not just code)
- **Zod Schemas**: Every table exports insertXSchema, selectXSchema, inferred TypeScript types
- **JSONB Logs**: LogEntry[] array in tasks.logs; append-only, real-time updates
- **Unique Constraints**: users (provider+externalId), keys (userId+provider), accounts (userId+provider)
- **Soft Deletes**: tasks.deletedAt column (excluded from rate limits, not hard-deleted)
- **Encryption**: OAuth tokens, API keys, MCP env vars all encrypted before storage

## Integration Points
- `app/api/auth/` - Create/update users and accounts on OAuth callback
- `app/api/tasks/` - Insert tasks, update logs, query by userId
- `lib/sandbox/agents/` - Fetch user keys for agent execution
- `lib/utils/rate-limit.ts` - Count tasks/messages per user per day

## Key Files
- `client.ts` - Lazy-loaded db proxy; Drizzle instance
- `schema.ts` - All table definitions + Zod schemas (1000+ lines)
- `Migration Workaround` - `cp .env.local .env && DOTENV_CONFIG_PATH=.env pnpm tsx ... && rm .env` (drizzle-kit doesn't auto-load .env.local)
