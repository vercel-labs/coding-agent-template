# GitHub Module

## Domain Purpose
GitHub API client: token retrieval, user lookup, and repository operations. Supports session, API token, and NextRequest authentication.

## Module Boundaries
- **Owns**: Token fetching, user lookups, auth method resolution, account/user table fallback logic
- **Delegates to**: `lib/crypto.ts` for decryption, `lib/session/` for session handling, `lib/db/` for account/user queries

## Local Patterns
- **Token Lookup**: Check `accounts` table first (connected GitHub) → Fall back to `users` table (primary provider)
- **Multi-Auth Support**: Three methods: `userId` (API token), `NextRequest` (API routes), `undefined` (server components)
- **Encryption**: All GitHub tokens are AES-256-CBC encrypted; decrypt on retrieval
- **Null Return**: Return `null` if no GitHub connection exists (never throw, never partial data)
- **Error Handling**: Catch DB/decryption errors silently; return null (no credentials leakage in logs)

## Integration Points
- `lib/tasks/process-task.ts` - Verify GitHub token before sandbox creation
- `lib/mcp/tools/create-task.ts` - Validate GitHub access for MCP external clients
- `app/api/github/` - GitHub OAuth callbacks, repository listing
- `lib/sandbox/agents/` - Pass token to agent CLI

## Key Files
- `user-token.ts` - `getUserGitHubToken()` (flexible auth), `getGitHubTokenByUserId()` (direct lookup)
- `client.ts` - GitHub REST API wrapper (repos, issues, PRs)
