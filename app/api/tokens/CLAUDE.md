# app/api/tokens

External API tokens for programmatic access (MCP clients, external apps). Dual-auth support (Bearer + session).

## Domain Purpose
- Generate, list, and revoke API tokens for external clients and MCP servers
- Token authentication enables `Authorization: Bearer <token>` and `?apikey=<token>` query param methods
- Tokens are SHA256 hashed before storage (cannot be recovered, shown once at creation)

## Local Patterns
- **Dual-auth**: `getAuthFromRequest(request)` checks Bearer token first, falls back to session
- **Hash on write**: `generateApiToken()` returns `{ raw, hash, prefix }`; store only hash
- **Prefix on list**: GET returns `tokenPrefix` only (first 8 chars) for identification
- **Rate limit**: Max 20 tokens per user (checked in POST)

## Routes
- `GET /api/tokens` - List user's tokens (id, name, prefix, createdAt, expiresAt, lastUsedAt)
- `POST /api/tokens` - Create token with name and optional expiresAt (returns raw token once)
- `DELETE /api/tokens/[id]` - Revoke token by id (user-scoped)

## Integration Points
- **Database**: `apiTokens` table (userId, name, tokenHash, tokenPrefix, expiresAt, lastUsedAt)
- **Crypto**: `generateApiToken()` from `@/lib/auth/api-token` (hash function)
- **MCP endpoint**: `app/api/mcp/route.ts` validates tokens via Bearer auth
- **Rate limiting**: Enforced per user (max 20 tokens)

## Token Object
- `id`, `userId` (FK), `name`, `tokenHash` (SHA256), `tokenPrefix` (8 chars)
- `createdAt`, `expiresAt` (optional), `lastUsedAt` (updated on use)
- Raw token returned only in POST response (201 status)

## Key Behaviors
- **No recovery**: Token cannot be retrieved after creation - show once then hash
- **Optional expiry**: POST accepts ISO datetime for `expiresAt`
- **Prefix-based ID**: GET shows prefix for human-readable token identification
- **Errors**: 401 unauthorized, 429 if 20+ tokens, 400 invalid input, 404 not found

## Key Files
- `route.ts` - GET/POST with `getAuthFromRequest()` dual-auth + token generation
- `[id]/route.ts` - DELETE with user-scoped ownership check
