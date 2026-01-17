# JWE Module

## Domain Purpose
JSON Web Encryption (JWE) for session tokens: A256GCM asymmetric encryption, expiration validation, graceful error handling.

## Module Boundaries
- **Owns**: JWE encryption/decryption, expiration claim management
- **Delegates to**: `jose` library for JWE standard implementation
- **Note**: Different from `lib/crypto.ts` (which uses AES-256-CBC for database encryption)

## Local Patterns
- **Algorithm**: A256GCM (AES-256-GCM) with direct encryption (dir)
- **Type Generics**: `encryptJWE<T>(...)` / `decryptJWE<T>(...)` for type safety
- **Expiration Format**: jose string format ('1 day', '7 days', '30m') - NOT milliseconds
- **Graceful Failure**: decryptJWE() returns `undefined` on any error (expired, malformed, corrupted) - never throws
- **Claim Cleanup**: Remove internal iat/exp claims from returned payload
- **Secret Format**: Base64url-encoded (NOT hex like crypto.ts); 32 bytes minimum

## Integration Points
- `lib/session/create.ts` - Create session JWE cookie after OAuth login
- `lib/session/server.ts` - Decrypt session token from cookie

## Key Files
- `encrypt.ts` - `encryptJWE<T>(payload, expirationTime, secret)` → JWE token string
- `decrypt.ts` - `decryptJWE<T>(token, secret)` → payload T | undefined
