# app/api/github - GitHub Integration API

Proxy endpoints for GitHub API interactions: user profile, repositories, organizations, verification, and repo creation. All routes use user's authenticated GitHub token.

## Domain Purpose
Provide REST interface to GitHub API capabilities: fetch user info, list repos/orgs, verify repo access, create new repos. Acts as secure proxy preventing direct token exposure to frontend.

## Routes

### User & Authentication
- **`user/`** - Get authenticated GitHub user (login, name, avatar)
  - Uses `getUserGitHubToken(req)`
  - Returns: `login`, `name`, `avatar_url`

### Repository Management
- **`user-repos/`** - List user's repositories
  - Supports pagination (page, per_page params)
  - Returns: repo names, descriptions, URLs, visibility
- **`repos/`** - Search/filter repos
  - Query params for filtering
- **`repos/create/`** - Create new repository
  - Requires repo name, description, visibility
  - Returns: clone URL, repo ID
- **`verify-repo/`** - Verify user has access to specific repo
  - Query params: owner, repo
  - Returns: boolean + repo details if accessible

### Organization Management
- **`orgs/`** - List user's organizations
  - Returns: org names, descriptions, avatars

## Key Patterns

### Authentication
```typescript
const token = await getUserGitHubToken(req)  // Session or OAuth account
if (!token) return 401 'GitHub not connected'
```

### GitHub API Calls
```typescript
const response = await fetch('https://api.github.com/endpoint', {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  },
})
if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)
```

### Token Retrieval
- Primary: User's connected GitHub account (`accounts` table)
- Fallback: Legacy GITHUB_TOKEN env var (if configured)
- Decrypted automatically via `decrypt()`

### Error Handling
- Invalid/expired token: `401`
- GitHub API failure: `500` with static message
- Repo access denied: `403` or `404` depending on GitHub response

## Database Interactions

### accounts table
- Query: `eq(provider, 'github')` + `eq(userId, user.id)`
- Field: `accessToken` (encrypted)
- Auto-decrypt in retrieval helper

## Response Format
- Always JSON
- Success: `{ login, name, avatar_url }` or arrays
- Error: `{ error: 'static message' }`
- HTTP status reflects result (200, 401, 404, 500)

## Security Notes
- Token stored encrypted in database
- Never exposed to frontend (only used server-side)
- Token decrypted on-demand for API calls
- GitHub Org/Repo verification prevents unauthorized access
- Static error messages (no token exposure)

## Rate Limiting
- GitHub API rate limit: 60 req/hour (unauthenticated), 5000/hour (authenticated)
- No local rate limiting on these endpoints (rely on GitHub's)
- If rate limited, GitHub returns `403` with `X-RateLimit-Reset` header

## Integration Points
- **GitHub API**: https://api.github.com (REST v3)
- **Auth Helper**: `getUserGitHubToken(req)` from `@/lib/github/user-token`
- **Database**: `accounts` table (token storage)
- **Crypto**: `decrypt()` for token retrieval

## Frontend Integration Notes
- UI calls these endpoints to populate repo lists, org selectors
- Endpoints provide real-time GitHub data (no local caching)
- Used during task creation (`new/[owner]/[repo]/page.tsx`)
- Task form populates user's accessible repos from this API
