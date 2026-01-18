# app/api/github

GitHub API proxy: user info, repositories, organizations, verification, repo creation.

## Domain Purpose
- Acts as secure proxy: decrypts user's GitHub token server-side, forwards requests to GitHub API
- Prevents token exposure to frontend
- Primary use: Populate repo lists and org selectors in task creation UI

## Local Patterns
- **Token retrieval**: `getUserGitHubToken(req)` from `@/lib/github/user-token`
  - Primary: Encrypted token from `accounts` table (provider='github')
  - Fallback: Legacy `GITHUB_TOKEN` env var (if configured)
- **Error response**: Always static message, no token/user ID exposure

## Routes (6 total)
- `GET /user` - Authenticated GitHub user info (login, name, avatar_url)
- `GET /user-repos` - User's repos with pagination
- `GET /repos` - Search/filter repos
- `POST /repos/create` - Create new repository
- `GET /verify-repo` - Verify access to specific repo
- `GET /orgs` - User's organizations

## Integration Points
- **GitHub API**: `https://api.github.com` (REST v3)
- **Database**: `accounts` table (token storage)
- **Crypto**: `decrypt()` for token retrieval
- **UI**: Task form populates repos from these endpoints

## Key Files
- `user/route.ts` - Profile endpoint (decrypts token, calls GitHub)
- `user-repos/route.ts` - Repo listing with pagination
- GitHub rate limit: 5000/hour (authenticated), fall back to 60/hour (unauthenticated)
