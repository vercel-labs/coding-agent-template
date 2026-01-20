# Branch Selection Feature

## Implementation Status

The branch selection feature is **fully implemented** and allows users to select a specific GitHub branch when creating coding tasks.

**Status**: All components completed ✓
- Database schema: `sourceBranch` field in tasks table
- API endpoint: `GET /api/github/branches` for fetching repository branches
- UI component: Branch selector dropdown in task creation form
- Sandbox execution: Git clone/checkout with source branch support
- MCP integration: `sourceBranch` parameter in create-task tool

## Overview

This document provides implementation details and reference information for the branch selection feature.

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

### Implemented Functionality

| Feature | Status |
|---------|--------|
| Branch name generation (AI) | ✅ Implemented |
| Branch name storage | ✅ `tasks.branchName` exists |
| Default branch detection | ✅ main → master fallback |
| Branch-based commits | ✅ Pushes to generated branch |
| Source branch selection UI | ✅ **IMPLEMENTED** |
| GitHub branches API endpoint | ✅ **IMPLEMENTED** |
| Source branch checkout | ✅ **IMPLEMENTED** |
| MCP tool parameter | ✅ **IMPLEMENTED** |

### Implemented Components

1. **API Endpoint**: `GET /api/github/branches?owner=...&repo=...` returns list of repository branches
2. **UI Component**: Branch selector dropdown in task creation form at `components/branch-selector.tsx`
3. **Form Field**: `sourceBranch` field in task creation form and validation schemas
4. **Sandbox Execution**: Git checkout with source branch before agent execution at `lib/sandbox/git.ts`
5. **Database Schema**: `sourceBranch` field in tasks table (optional, defaults to repo default)
6. **MCP Integration**: `sourceBranch` parameter in create-task tool for programmatic task creation

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

## Data Flow

**Implemented Flow:**
1. User selects repository → stored in form state
2. User optionally selects source branch → stored in form state (defaults to repo's default branch)
3. Task created with `repoUrl` and `sourceBranch` parameter
4. Sandbox clones repository and checks out specified source branch
5. Agent works on auto-generated feature branch created from source branch
6. Feature branch is pushed to GitHub with PR creation

**Branch Selection Behavior:**
- Source branch dropdown populated by `GET /api/github/branches` endpoint
- Optional field: if not selected, repository's default branch is used
- Source branch is stored in `tasks.sourceBranch` database field
- Sandbox execution uses source branch for initial checkout before agent execution
- Feature branch created from source branch point (preserves branching context)

## Technical Implementation Details

### API Endpoint (`app/api/github/branches/route.ts`)
- Authenticated endpoint requiring GitHub connection
- Returns array of branches from GitHub REST API
- Includes branch name, commit SHA, and protection status
- Used by UI to populate branch selector dropdown

### UI Component (`components/branch-selector.tsx`)
- Optional dropdown field in task creation form
- Displays list of branches fetched from API
- Disabled while loading branches
- Shows repo's default branch if available
- Updates form state with selected branch

### Database & Validation
- `sourceBranch` field in tasks table (TEXT, nullable)
- Included in Zod validation schemas (insertTaskSchema, selectTaskSchema)
- Optional parameter - tasks can be created without specifying a branch

### Sandbox Execution (`lib/sandbox/git.ts`)
- Clone repository with specified branch (or default)
- Checkout source branch before agent execution
- Agent works on feature branch created from source branch point
- Push changes to feature branch with PR creation

### MCP Integration (`lib/mcp/schemas.ts`)
- `sourceBranch` parameter in createTaskSchema (optional)
- Documented in create-task tool
- Supports programmatic task creation via MCP clients
