# app/api/auth - OAuth & Session Management

Handles user authentication flows (OAuth callbacks, sign-in/sign-out), session encryption, and GitHub account linking.

## Domain Purpose
Manage user authentication lifecycle: OAuth flows with GitHub/Vercel, JWE session token creation, account merging, token encryption, sign-out cleanup.

## Routes

### OAuth Sign-In Flows
- **`signin/github`**, **`signin/vercel`** - Redirect to provider OAuth
- **`callback/vercel`** - Vercel OAuth callback, creates session
- **`github/callback`** - GitHub OAuth callback (sign-in or connect flow)
  - Detects flow type via cookies (`github_auth_mode`)
  - Sign-in: Creates new user session
  - Connect: Adds GitHub account to existing Vercel user
  - Account merging: Transfers tasks/connectors/keys between users if needed

### Session Management
- **`signout`** - Destroy JWE session token (cookie deletion)
- **`info`** - Get current user info from session
- **`github/status`** - Check if GitHub connected (via `accounts` table)
- **`github/disconnect`** - Remove GitHub account from user
- **`rate-limit`** - Current user's rate limit status

## Key Patterns

### OAuth State Validation
```typescript
const storedState = cookieStore.get('github_auth_state')?.value
const storedRedirectTo = cookieStore.get('github_auth_redirect_to')?.value
if (storedState !== state || !storedRedirectTo) return 400 // Invalid
```

### Session Creation
- GitHub: `createGitHubSession()` → `saveSession(response, session)` → JWE cookie
- Vercel: Similar flow, encrypts access token in `users` table
- Session token: Encrypted with `JWE_SECRET` env var

### Account Merging (GitHub Connect Flow)
When connecting GitHub account already linked to another user:
```typescript
// Transfer all data from old user to new user
await db.update(tasks).set({ userId: newUserId }).where(...)
await db.update(connectors).set({ userId: newUserId }).where(...)
await db.delete(users).where(eq(users.id, oldUserId))
```

### Encryption Requirements
- OAuth access tokens: Encrypted before storing in `users`/`accounts` tables
- Method: `encrypt(token)` from `@/lib/crypto`
- Decryption on use via: `decrypt(user.accessToken)`

## Database Tables

### users
- `id`, `email`, `name`, `image`
- `primaryProvider` - OAuth provider (github, vercel)
- `accessToken` (encrypted), `scope`
- GitHub/Vercel credentials stored here

### accounts
- Linked OAuth accounts (one GitHub + one Vercel per user possible)
- `provider`, `externalUserId`, `accessToken` (encrypted), `username`
- Enables user to have GitHub + Vercel linked

## Error Handling
- Invalid OAuth state: `400 Bad Request`
- Missing client credentials: `500 Server Error`
- Token exchange failure: Log error, return `400`
- Static error messages (no token/user ID exposure)

## Integration Points
- **Crypto**: `@/lib/crypto` (encrypt/decrypt)
- **Session**: `@/lib/session/create-github` (session creation)
- **Database**: `users`, `accounts`, `tasks`, `connectors`, `keys` tables
- **GitHub/Vercel APIs**: OAuth token exchange endpoints

## Security Notes
- All OAuth tokens encrypted at rest
- Session tokens JWE-encrypted (non-reversible without secret)
- Cookie SameSite=Strict for CSRF protection
- State parameter validation prevents authorization code interception
