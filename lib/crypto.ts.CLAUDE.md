# Crypto Module

## Domain Purpose
AES-256-CBC encryption/decryption for database secrets: OAuth tokens, API keys, MCP credentials.

## Module Boundaries
- **Owns**: Symmetric encryption/decryption for app data
- **Note**: Different from `lib/jwe/` (which uses A256GCM for session tokens)

## Local Patterns
- **Algorithm**: AES-256-CBC (Node.js crypto standard)
- **IV**: Random 16 bytes per encryption (unique nonce per call)
- **Format**: `${iv_hex}:${ciphertext_hex}` (parseable, debuggable)
- **Key Format**: 32-byte hex string (NOT base64url like JWE_SECRET); 64 hex characters
- **Encryption**: Random IV generated per call, preventing pattern detection

## Integration Points
- `lib/db/schema.ts` - OAuth tokens (users.accessToken), API keys (keys.value)
- `lib/sandbox/agents/claude.ts` - Decrypt user API keys before setting env vars
- `app/api/api-keys/` - Encrypt/decrypt user API keys
- `app/api/connectors/` - MCP server env vars encrypted

## Key Functions
- `encrypt(plaintext)` - Returns `iv_hex:ciphertext_hex` string
- `decrypt(encrypted)` - Parses format, returns plaintext; throws on error
