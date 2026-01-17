# Crypto Module (lib/crypto.ts)

## Domain Purpose
Provide AES-256-CBC encryption/decryption for sensitive data at rest (OAuth tokens, API keys, MCP credentials).

## Key Responsibilities
- **Encryption**: Encrypt plaintext with random IV; return IV:ciphertext hex-encoded string
- **Decryption**: Parse IV:ciphertext format; decrypt and return plaintext
- **Key Management**: Load ENCRYPTION_KEY from environment; validate 32-byte hex
- **Error Handling**: Throw descriptive errors for invalid key format or decryption failures

## Usage Patterns
```typescript
// Store (encryption)
const encrypted = encrypt(apiKey)
await db.insert(keys).values({ value: encrypted })

// Retrieve (decryption)
const encrypted = userKey.value
const plaintext = decrypt(encrypted)
process.env.ANTHROPIC_API_KEY = plaintext
```

## Where This Is Used
- **lib/db/schema.ts**: OAuth tokens (users.accessToken), API keys (keys.value)
- **lib/session/**: Session JWE encryption (separate module)
- **lib/sandbox/agents/claude.ts**: Decrypt and set API keys from user storage
- **app/api/api-keys/**: Get user's API key (decrypt), update (encrypt)
- **lib/mcp/**: MCP server env vars stored encrypted

## Core Implementation
- **Algorithm**: AES-256-CBC (Node.js crypto standard)
- **IV**: Random 16 bytes per encryption (nonce for security)
- **Format**: `${iv_hex}:${ciphertext_hex}` (parseable, debuggable)
- **Key Source**: `process.env.ENCRYPTION_KEY` (hex string)

## Environment Setup
```bash
# Generate 32-byte hex key (required)
openssl rand -hex 32
# Example: a1b2c3d4e5f6... (64 hex characters)

# Add to .env.local
ENCRYPTION_KEY=a1b2c3d4e5f6...
```

## Error Cases
- **Missing Key**: Throws "ENCRYPTION_KEY environment variable is required..."
- **Invalid Key Length**: Throws "ENCRYPTION_KEY must be a 32-byte hex string..."
- **Bad Decryption Format**: Throws "Invalid encrypted text format"
- **Decryption Failure**: Throws "Failed to decrypt: ..." (includes original error)

## Security Notes
- **No Plaintext Storage**: Tokens/keys never stored in plaintext
- **Random IV**: Each encryption uses fresh random IV (prevents pattern detection)
- **Encryption Key Protection**: ENCRYPTION_KEY is env var (not hardcoded); keep secure
- **Decryption Timing**: Vulnerable to timing attacks (acceptable for this use case)

## Integration Checklist
- [ ] ENCRYPTION_KEY set in .env.local (64 hex characters)
- [ ] All token/key storage uses encrypt() before DB insert
- [ ] All token/key retrieval uses decrypt() before use
- [ ] Error handling for decryption failures (graceful fallback or clear error)
- [ ] No plaintext keys in logs (use redactSensitiveInfo())

## Files Importing This Module
- lib/db/schema.ts (JWE encryption uses different module; crypto.ts is for app data)
- lib/sandbox/agents/claude.ts
- lib/api-keys/user-keys.ts
- app/api/api-keys/route.ts
- app/api/connectors/route.ts (MCP server env vars)
