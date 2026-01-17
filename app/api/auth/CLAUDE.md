# app/api/auth

OAuth sign-in/connect flows, session creation, account merging, sign-out cleanup.

## Domain Purpose
- Create JWE sessions from GitHub/Vercel OAuth tokens
- Handle GitHub account linking to existing users (account merging)
- Validate OAuth state parameter to prevent authorization code interception

## Local Patterns
- **OAuth state validation**: `cookieStore.get('github_auth_state')?.value` must match callback state parameter
- **Account merging**: When GitHub account linked to another user, transfer all data (tasks, connectors, keys) to new userId
- **Routes detect flow type**: Sign-in vs connect via cookies (`github_auth_mode`)

## Routes
- `signin/github`, `signin/vercel` - Redirect to provider OAuth
- `callback/vercel` - Creates JWE session from token
- `github/callback` - Sign-in or connect flow (state-validated)
- `signout` - Destroy session cookie
- `info`, `github/status`, `github/disconnect`, `rate-limit` - Session queries

## Integration Points
- **Crypto**: `@/lib/crypto` (encrypt/decrypt OAuth tokens)
- **Session**: `@/lib/session/create-github` (JWE session creation)
- **Database**: `users`, `accounts` (OAuth token storage), `tasks`, `connectors`, `keys` (merging data)
- **GitHub/Vercel OAuth**: Token exchange endpoints

## Key Files
- `signin/github/route.ts`, `signin/vercel/route.ts` - OAuth redirects with state cookie
- `github/callback/route.ts` - Handles merging and session creation
- OAuth tokens encrypted before storing in database
