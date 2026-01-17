# Auth Module

## Domain Purpose
Dual-auth resolution: Bearer tokens (hashed SHA256) + session cookies; provider detection (GitHub/Vercel).

## Module Boundaries
- **Owns**: Token generation, hashing, lookup validation, expiry checks, provider configuration
- **Delegates to**: `lib/session/` for cookie-based sessions, `lib/crypto.ts` for encryption, `lib/db/` for queries

## Local Patterns
- **Token Generation**: Random 32-byte hex → Hash immediately → Prefix (first 8 chars) for UI display
- **Token Lookup**: Hash incoming token → Compare with DB (no plaintext ever stored/compared)
- **Expiry Validation**: Check expiration **BEFORE** updating lastUsedAt (fail-fast)
- **Dual-Auth Priority**: Bearer token → Hash → Lookup → Fallback to session cookie if absent
- **Raw Token Return**: Shown once at creation only; cannot be retrieved later (security by design)

## Integration Points
- `app/api/auth/` - OAuth callbacks create users, refresh tokens
- `app/api/tokens/` - Token CRUD: `generateApiToken()`, `hashToken()`
- All API routes - `getAuthFromRequest()` for dual-auth (Bearer + session)
- `lib/db/schema.ts` - apiTokens table (tokenHash, userId, expiresAt, lastUsedAt)

## Key Files
- `api-token.ts` - `getAuthFromRequest()`, `generateApiToken()`, `hashToken()`
- `providers.ts` - `getEnabledAuthProviders()` for GitHub/Vercel configuration
