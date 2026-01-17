# app/api

REST interface for platform: authentication, user-scoped data access, rate limiting. 61 routes across 9 subdirectories.

## Domain Purpose
- Every API route validates user identity, filters data by userId, and enforces 20/day rate limit
- Dual-auth: Bearer token (API tokens) → session cookie fallback
- Static-string logging only (no dynamic values)

## Local Patterns
- Import `getAuthFromRequest(request)` from `@/lib/auth/api-token` for dual Bearer/session auth
- Session-only routes: `getServerSession()` or `getSessionFromReq(request)`
- All queries include `eq(table.userId, user.id)` filter
- Return `401 Unauthorized` if not authenticated

## Route Subdirectories
- `auth/` (10) - OAuth, session creation, GitHub connect, disconnect, sign-out, rate-limit info
- `tasks/` (32) - Task CRUD, sandbox control, file ops, PR management, follow-ups, messages
- `github/` (6) - GitHub API proxy (user, repos, orgs, verify, create)
- `repos/` (5) - Repository metadata (commits, issues, pull-requests with check/close)
- `connectors/` (1) - MCP server CRUD with encrypted env vars
- `mcp/` (1) - MCP protocol HTTP handler with Bearer auth
- `api-keys/` (2) - User API key management (list/create and check availability)
- `tokens/` (2) - External API token generation, listing, revocation
- `sandboxes/` (1) - Sandbox metadata and control
- `vercel/` (1) - Vercel-specific operations (teams)
- `github-stars/` (1) - GitHub stars utility endpoint

## Integration Points
- **Database**: `@/lib/db/client` (Drizzle + PostgreSQL)
- **Sandbox**: `@/lib/sandbox/` (creation, git ops, agent execution)
- **Auth**: `@/lib/auth/`, `@/lib/session/` (JWE sessions, OAuth)
- **Rate Limit**: `@/lib/utils/rate-limit.ts`
- **MCP Tools**: `@/lib/mcp/tools/`

## Key Files
- `route.ts` - Each route file handles one endpoint with dual-auth validation
- Routes use Zod schemas (e.g., `insertTaskSchema`) for request validation
- Promise-based params: `const { id } = await params` (Next.js 15+)
