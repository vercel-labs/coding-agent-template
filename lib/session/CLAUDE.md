# Session Module

## Domain Purpose
Manage encrypted JWE session cookies, OAuth token storage, and server-side session validation for authenticated requests.

## Key Responsibilities
- **Session Creation**: Create encrypted JWE cookie with user data, auth provider, and timestamp
- **Session Retrieval**: Decrypt JWE from cookie; validate signature; return user context
- **Cookie Caching**: React cache() prevents redundant decryption in same request
- **Redirect Handlers**: OAuth sign-in/out redirects with session state management
- **OAuth Token Handling**: Encrypt/decrypt OAuth tokens; manage refresh tokens
- **GitHub/Vercel Providers**: Provider-specific session creation and token management

## Module Boundaries
- **Delegates to**: `lib/jwe/encrypt.ts`, `lib/jwe/decrypt.ts` for JWE operations
- **Delegates to**: `lib/crypto.ts` for encryption key management
- **Delegates to**: `lib/auth/api-token.ts` for API token authentication
- **Delegates to**: `lib/db/schema.ts`, `lib/db/client.ts` for user/account queries
- **Owned**: Session lifecycle, JWE cookie handling, OAuth flow coordination

## Core Types & Patterns
```typescript
// Session: { created, authProvider, user }
// User: { id, username, email, avatar, name }
// Tokens: { accessToken, refreshToken?, expiresAt? }
```

## Local Patterns
- **JWE Cookie**: Encrypted asymmetric; signed; httpOnly, secure, sameSite
- **Session Cache**: React cache() wraps getServerSession() for request deduplication
- **Token Encryption**: All OAuth tokens encrypted before storage
- **Provider Tagging**: Track which provider user authenticated with (GitHub vs Vercel)

## Integration Points
- **app/api/auth/callback/**: OAuth redirects create/update session
- **app/api/auth/signout/**: Clear session cookie via redirect
- **getServerSession()**: Used in all API routes for auth validation
- **getAuthFromRequest()**: Falls back to session if Bearer token absent
- **lib/db/users.ts**: Fetch user by userId from session

## Files in This Module
- `get-server-session.ts` - Exported `getServerSession()` with cache
- `server.ts` - `getSessionFromCookie()`, `getSessionFromReq()` (internal)
- `types.ts` - Session, SessionUserInfo, Tokens, User interfaces
- `constants.ts` - SESSION_COOKIE_NAME, cookie options
- `create.ts` - Create JWE cookie value with user data
- `create-github.ts` - GitHub OAuth flow session creation
- `get-oauth-token.ts` - Decrypt and validate OAuth tokens
- `redirect-to-sign-in.ts` - OAuth redirect to provider login
- `redirect-to-sign-out.ts` - Clear session and redirect home

## Common Workflows
1. **OAuth Callback**: Extract code → Fetch tokens from provider → Create user/account → Create JWE session
2. **API Request**: Read cookie → Decrypt JWE → Validate → Return user for request
3. **Sign Out**: Call redirect helper → Clear session cookie → Redirect to home
4. **Token Refresh**: Check expiry → Decrypt refresh token → Exchange for new access token

## Security Notes
- **JWE Encryption**: Asymmetric encryption; signed; prevents tampering
- **Token Encryption**: All OAuth tokens encrypted at rest in users/accounts tables
- **Cookie Flags**: httpOnly (no JS access); Secure (HTTPS only); SameSite (CSRF protection)
- **Cache Safety**: React's request cache() is safe; each request gets fresh session
- **User Isolation**: Session contains userId; all queries scoped to authenticated user

## Gotchas & Edge Cases
- **Token Expiry**: Some providers (Vercel) don't include expiresAt; manually expire if older than 1 hour
- **Refresh Token Absence**: GitHub doesn't provide refresh tokens; Vercel does
- **Cookie Parse**: Must extract from request/cookie store correctly; empty if absent
- **JWE Decryption**: Fails gracefully if corrupted/tampered; returns undefined instead of error
