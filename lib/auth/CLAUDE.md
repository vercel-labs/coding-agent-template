# Auth Module

## Domain Purpose
Manage authentication provider configuration, dual-auth API token + session cookie support, and API key storage.

## Key Responsibilities
- **Provider Detection**: Read `NEXT_PUBLIC_AUTH_PROVIDERS` env var; support GitHub, Vercel, or both
- **API Token Authentication**: Dual-auth helper for Bearer token + session fallback
- **Token Hashing**: SHA256 hash tokens before storage; support raw token generation (shown once)
- **User API Key Management**: Encrypted storage of user-provided API keys (Anthropic, OpenAI, etc.)
- **Token Expiry Validation**: Check expiration before returning user record; prevent expired access

## Module Boundaries
- **Delegates to**: `lib/session/get-server-session.ts` for cookie-based sessions
- **Delegates to**: `lib/crypto.ts` for encryption/decryption
- **Delegates to**: `lib/db/schema.ts`, `lib/db/client.ts` for token/user queries
- **Owned**: API token generation, hashing, validation; provider configuration

## Core Types & Patterns
```typescript
// API Token: { raw: string, hash: string, prefix: string }
// dual-auth: Check Bearer token first → Fall back to session cookie
```

## Files in This Module
- `api-token.ts` - `getAuthFromRequest()` (dual-auth), `generateApiToken()`, `hashToken()`
- `providers.ts` - `getEnabledAuthProviders()` (GitHub/Vercel config)

## Local Patterns
- **Token Generation**: Random 32-byte hex; hash immediately; prefix (first 8 chars) stored for UI
- **Token Lookup**: Hash incoming token; compare with hashed storage (no plaintext)
- **Expiry Check**: Must verify expiration BEFORE updating lastUsedAt
- **User Lookup**: Fetch from users table; verify token was not deleted

## Integration Points
- **app/api/auth/**: OAuth callbacks create users, refresh tokens
- **app/api/tokens/**: Token CRUD endpoints use `generateApiToken()`, `hashToken()`
- **All API routes**: Call `getAuthFromRequest()` for dual-auth support
- **lib/db/settings.ts**: User settings store API keys (encrypted)
- **lib/db/schema.ts**: apiTokens table (tokenHash, userId, expiresAt, lastUsedAt)

## Common Workflows
1. **Create API Token**: Generate random → Hash → Store hash + metadata → Return raw (once)
2. **Authenticate Request**: Extract Bearer token → Hash → Lookup → Check expiry → Fetch user
3. **Fallback to Session**: If no Bearer token, read cookie → Validate JWE → Return user
4. **Store API Key**: Encrypt user-provided key → Store in keys table → Tag with provider

## Security Notes
- **Token Visibility**: Raw token shown at creation only; cannot be retrieved later
- **Hash Storage**: SHA256 hash prevents data leakage if apiTokens table compromised
- **Expiry Enforcement**: Expired tokens rejected before user lookup (fail fast)
- **User Isolation**: All token queries scoped to userId; users cannot access other users' tokens
