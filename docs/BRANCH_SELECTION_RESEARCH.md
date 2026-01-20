# Branch Selection Feature Research

## Overview

This document contains research findings for implementing the ability for users to select a specific GitHub branch when creating coding tasks.

## Current State Summary

### GitHub Integration

**Authentication Flow:**
- OAuth with state validation via `/api/auth/github/callback`
- Tokens encrypted (AES-256-CBC) and stored in `users.accessToken` or `accounts.accessToken`
- Retrieval via `getUserGitHubToken()` in `lib/github/user-token.ts`

**Repository Access:**
- API routes in `app/api/github/` serve as server-side proxies
- `/api/github/repos` - Fetches user's repositories
- `/api/github/user-repos` - Fetches with search/pagination
- `/api/github/orgs` - Fetches user's organizations
- `/api/github/verify-repo` - Verifies repo access

**Task Execution with GitHub:**
- GitHub token passed through `TaskProcessingInput` to sandbox
- Authenticated URL format: `https://{token}:x-oauth-basic@github.com/owner/repo.git`
- Git operations: clone, commit, push via `lib/sandbox/git.ts`

### Database Schema

**Tasks Table Branch Fields:**
```typescript
tasks = {
  branchName: text (optional),  // Already exists - no migration needed!
  // AI-generated format: {type}/{description}-{6-char-hash}
  // Fallback format: agent/{timestamp}-{taskId-prefix}
}
```

**Key Finding:** The `branchName` field already exists and is optional. No schema migration is required.

### Existing Branch Functionality

| Feature | Status |
|---------|--------|
| Branch name generation (AI) | ✅ Implemented |
| Branch name storage | ✅ `tasks.branchName` exists |
| Default branch detection | ✅ main → master fallback |
| Branch-based commits | ✅ Pushes to generated branch |
| Branch listing/selection UI | ❌ **NOT IMPLEMENTED** |
| GitHub branches API endpoint | ❌ **MISSING** |

### Missing Components

1. **API Endpoint**: No `/api/github/branches` route to fetch repository branches
2. **UI Component**: No branch selector dropdown in the task form
3. **Form Field**: No `sourceBranch` or `baseBranch` field in task creation form
4. **Validation**: No branch existence validation before task execution

## Key Files Reference

| Feature | Files |
|---------|-------|
| OAuth Flow | `app/api/auth/github/{signin,callback}/route.ts`, `lib/session/create-github.ts` |
| Token Retrieval | `lib/github/user-token.ts` |
| Repo Access | `app/api/github/{repos,user-repos,orgs,verify-repo}/route.ts` |
| Task Creation | `app/api/tasks/route.ts`, `lib/tasks/process-task.ts` |
| Sandbox/Git | `lib/sandbox/creation.ts`, `lib/sandbox/git.ts` |
| Branch Generation | `lib/utils/branch-name-generator.ts` |
| UI Components | `components/repo-selector.tsx`, `components/task-form.tsx` |
| Schema | `lib/db/schema.ts` (lines ~140-220 for tasks table) |

## GitHub API for Branches

The GitHub REST API provides a branches endpoint:

```
GET /repos/{owner}/{repo}/branches
```

Returns array of:
```json
[
  {
    "name": "main",
    "commit": { "sha": "...", "url": "..." },
    "protected": true
  },
  {
    "name": "develop",
    "commit": { "sha": "...", "url": "..." },
    "protected": false
  }
]
```

This endpoint requires read access to the repository (which our OAuth tokens have).

## UI Design Requirements

Based on user requirements:
- Branch selector should be a dropdown to the right of the repository selector
- Same styling as existing dropdowns (shadcn/ui components)
- Three dots button pushed further right to accommodate the new dropdown
- Only show when a repository is selected
- Disabled state while loading branches

## Data Flow Considerations

**Current Flow:**
1. User selects repository → stored in form state
2. Task created with `repoUrl` → API generates branch name
3. Sandbox clones from default branch (main/master)
4. Agent works on auto-generated feature branch

**Proposed Flow:**
1. User selects repository → stored in form state
2. **NEW:** User optionally selects source branch → stored in form state
3. Task created with `repoUrl` AND `sourceBranch`
4. Sandbox clones and checks out specified branch (or default)
5. Agent works on auto-generated feature branch based from source

## Technical Notes

- The `git clone` in sandbox needs to be updated to checkout specific branch
- Consider caching branches list (Jotai atom similar to repos)
- Branch list could be large - consider pagination or search
- Default branch should be pre-selected if provided by GitHub API
