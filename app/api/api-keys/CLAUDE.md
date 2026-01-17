# app/api/api-keys

User API key management for AI providers (OpenAI, Gemini, Cursor, Anthropic, AI Gateway).

## Domain Purpose
- Store and manage user-provided API keys for AI agents (encrypted at rest)
- Provide fallback key availability check for task execution
- Support multiple providers with upsert pattern (insert or update)

## Local Patterns
- **Session-only auth**: `getSessionFromReq(request)` - no Bearer token support
- **Encryption**: Always encrypt keys before storing: `encrypt(apiKey)`
- **Decryption**: Decrypt on retrieval: `decrypt(key.value)`
- **Providers**: `'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'`

## Routes
- `GET /api/api-keys` - List user's keys (decrypted providers + createdAt, no values exposed)
- `GET /api/api-keys/check` - Check availability of API keys (returns object with provider booleans)
- `POST /api/api-keys` - Create or update key for provider (upsert pattern)
- `DELETE /api/api-keys?provider=X` - Delete key for provider

## Integration Points
- **Database**: `keys` table (userId, provider, encrypted value)
- **Crypto**: `@/lib/crypto` (encrypt/decrypt)
- **Agent execution**: Agents retrieve via `getUserApiKey(provider)` from `@/lib/api-keys/user-keys`
- **UI**: Settings page for key management

## Key Behaviors
- **Upsert**: POST creates if not exists, updates if exists (same provider + userId)
- **Validation**: Provider must be one of 5 supported types
- **Return values**: GET returns decrypted values; POST/DELETE return success flag only
- **Errors**: 401 if not authenticated, 400 if invalid provider, 500 on DB errors

## Key Files
- `route.ts` - GET/POST/DELETE handlers with encryption/decryption
- Zod validation for provider values (implicit via type check)
