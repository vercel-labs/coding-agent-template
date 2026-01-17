# Session Module

## Domain Purpose
JWE session cookie lifecycle: creation, decryption, caching; OAuth token encryption and provider-specific handling.

## Module Boundaries
- **Owns**: Session lifecycle, JWE cookie handling, OAuth flow coordination, token encryption
- **Delegates to**: `lib/jwe/` for JWE encryption/decryption, `lib/auth/api-token.ts` for dual-auth fallback, `lib/db/` for user/account queries

## Local Patterns
- **JWE Cookie**: Encrypted + signed; flags: httpOnly, Secure, SameSite
- **Session Cache**: React `cache()` wraps `getServerSession()` to prevent redundant decryption per request
- **Token Encryption**: All OAuth tokens encrypted at rest in users/accounts tables
- **Provider-Specific**: Track auth provider (GitHub vs Vercel); Vercel provides refresh tokens, GitHub doesn't
- **Token Expiry**: Manually expire old tokens (> 1 hour) if provider omits expiresAt
- **Graceful Failure**: JWE decryption returns undefined if corrupted/tampered (no throw)

## Integration Points
- `app/api/auth/callback/` - OAuth redirects create/update session
- `app/api/auth/signout/` - Clear session cookie
- All API routes - `getServerSession()` for auth validation
- `lib/auth/api-token.ts` - Falls back to session if Bearer token absent

## Key Files
- `get-server-session.ts` - Exported `getServerSession()` with cache wrapper
- `create.ts` - Create JWE cookie with user data
- `create-github.ts` - GitHub OAuth flow session creation
