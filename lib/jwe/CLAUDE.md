# JWE Module

## Domain Purpose
Provide JSON Web Encryption (JWE) for session tokens using asymmetric encryption with expiration validation.

## Key Responsibilities
- **Session Token Encryption**: Create JWE tokens with expiration timestamps
- **Token Decryption**: Decrypt and validate JWE tokens; extract payload
- **Expiration Validation**: Enforce token expiration; extract and remove iat/exp claims
- **Secret Management**: Load JWE_SECRET from environment; validate as base64url

## Core Implementation
- **Algorithm**: Direct encryption (dir) with A256GCM (AES-256-GCM)
- **Library**: jose (JWE standard library; not custom crypto)
- **Payload**: Generic type support (string or object)
- **Expiration**: Set at encryption time; validated at decryption

## Files in This Module
- `encrypt.ts` - `encryptJWE<T>(payload, expirationTime, secret)` → JWE token string
- `decrypt.ts` - `decryptJWE<T>(token, secret)` → payload T | undefined

## Usage Patterns
```typescript
// Encrypt (create session token)
const token = await encryptJWE(
  { user: { id, username, email }, authProvider: 'github' },
  '1 day',  // Expiration time string (jose format)
  process.env.JWE_SECRET
)
// Set as httpOnly cookie

// Decrypt (validate session token)
const session = await decryptJWE<Session>(cookieValue, process.env.JWE_SECRET)
// Returns undefined if expired or invalid
```

## Environment Setup
```bash
# Generate 32-byte base64url-encoded secret (required)
openssl rand -base64 32
# Example: AbC1d2E3fG4h5I6jK7l8M9n0O1p2Q3r4... (base64url)

# Add to .env.local
JWE_SECRET=AbC1d2E3fG4h5I6jK7l8M9n0O1p2Q3r4...
```

## Where This Is Used
- **lib/session/create.ts**: Create session JWE cookie after OAuth login
- **lib/session/server.ts**: Decrypt session token from cookie in getSessionFromCookie()
- **app/api/auth/**: OAuth callback uses encryptJWE() to create session

## Error Handling
- **Missing Secret**: Throws "Missing JWE secret"
- **Invalid Input**: decryptJWE() returns undefined (no throw; graceful)
- **Expired Token**: decryptJWE() returns undefined (jose validates expiration)
- **Malformed Token**: decryptJWE() returns undefined (catch block silently fails)

## Security Notes
- **Asymmetric Encryption**: A256GCM provides authenticated encryption (prevents tampering)
- **Expiration Enforcement**: Tokens expire per claim; cannot be reused after expiration
- **Secret Protection**: JWE_SECRET is environment variable; keep secure
- **Claim Cleanup**: Remove iat/exp from returned payload (internal jose claims)
- **No Plaintext**: Never log the JWE token itself (contains encrypted user data)

## Local Patterns
- **Type Generic**: `encryptJWE<T>(...)` / `decryptJWE<T>(...)` for type safety
- **Graceful Fallback**: decryptJWE returns undefined on any error (not exception)
- **Expiration Format**: String format like '1 day', '7 days', '30s' (jose standard)
- **Base64url Secret**: Must be base64url-encoded (not plain hex)

## Integration Checklist
- [ ] JWE_SECRET set in .env.local (base64url-encoded, 43+ characters)
- [ ] Session tokens created with appropriate expiration (e.g., '1 day')
- [ ] All session decryption handles undefined gracefully (expired tokens)
- [ ] No JWE tokens logged in plaintext
- [ ] Test with expired tokens (should return undefined)

## Gotchas & Edge Cases
- **Secret Format**: Base64url (not hex like crypto.ts)
- **Expiration String**: Use jose format ('1 day', '7 days', '30m'); not milliseconds
- **No Token Refresh**: Once expired, token is invalid (no refresh token mechanism)
- **Error Silent**: Decryption errors return undefined; may confuse debugging if secret mismatched
