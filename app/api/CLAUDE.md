# app/api - API Routes Overview

Core API endpoint handler with unified authentication, user-scoped data access, and rate limiting enforcement.

## Domain Purpose
All API routes (61 files across 9 subdirectories) serve as the REST interface for the platform. Routes authenticate users, validate ownership, encrypt sensitive data, and enforce rate limits before processing.

## Key Patterns

### Authentication & Authorization
- **Dual-auth helper**: `getAuthFromRequest(request)` checks Bearer token first (API tokens), falls back to session cookie
- Routes that support both: `getAuthFromRequest()` from `@/lib/auth/api-token`
- Session-only routes: `getServerSession()` or `getSessionFromReq(request)`
- All routes return `401 Unauthorized` if user not authenticated

### User-Scoped Data Access
- **Mandatory filtering**: Every database query includes `eq(table.userId, user.id)`
- No cross-user data exposure
- Tasks, connectors, messages, API keys scoped to authenticated user

### Logging & Error Handling
- **Static strings only**: Log messages never include dynamic values (IDs, tokens, file paths, errors)
- Pattern: `console.error('Error fetching tasks')` not `console.error('Failed: ${error.message}')`
- TaskLogger for real-time task updates: `await logger.info('Task started')`

### Common Imports
```typescript
import { getAuthFromRequest } from '@/lib/auth/api-token'        // Dual auth
import { getServerSession } from '@/lib/session/get-server-session'  // Session only
import { createTaskLogger } from '@/lib/utils/task-logger'        // Real-time logs
import { checkRateLimit } from '@/lib/utils/rate-limit'           // Rate enforce
import { encrypt, decrypt } from '@/lib/crypto'                   // Secure tokens
```

## Module Breakdown

### api/auth/ (7 routes)
OAuth flows (GitHub, Vercel), session management, sign-in/sign-out, account connection.

### api/tasks/ (31 routes)
Task CRUD, execution lifecycle, sandbox control, file operations, PR management, follow-up messages.

### api/github/ (7 routes)
GitHub API proxy: user info, repos, orgs, verify, create repo.

### api/repos/ (5 routes)
Repository metadata: commits, issues, pull requests (by owner/repo).

### api/connectors/ (1 route)
MCP server connector CRUD, encryption/decryption of env vars and OAuth secrets.

### api/mcp/ (1 route)
Model Context Protocol HTTP handler, tool registration, Bearer token auth, task management via MCP clients.

### api/api-keys/ (2 routes)
User API key management, encrypted storage, global fallback check.

### api/tokens/ (2 routes)
External API token generation, storage (SHA256 hashed), revocation.

### Other
- `api/sandboxes/` - Sandbox listing
- `api/vercel/` - Vercel team integration
- `api/github-stars/` - GitHub stats

## Security Requirements

- **Encryption**: All tokens, API keys, OAuth credentials encrypted with `lib/crypto.ts`
- **Static logging**: Zero dynamic values in logs (prevents data leakage in UI)
- **Token hashing**: External API tokens SHA256 hashed before storage
- **CORS & CSP**: Configured in Next.js middleware
- **Rate limiting**: 20 messages/day per user (100/day for admin domains)

## Type Safety
- Zod schemas for request validation (e.g., `insertTaskSchema`)
- Drizzle ORM for type-safe queries
- Promise-based params destructuring (Next.js 15+): `const { taskId } = await params`

## Integration Points
- **Database**: `@/lib/db/client` (Drizzle + PostgreSQL)
- **Sandbox**: `@/lib/sandbox/` (Vercel Sandbox creation, git ops, agent execution)
- **Auth**: `@/lib/auth/`, `@/lib/session/` (JWE sessions, OAuth)
- **Crypto**: `@/lib/crypto` (encryption at rest)
- **MCP Tools**: `@/lib/mcp/tools/` (handler implementations)
