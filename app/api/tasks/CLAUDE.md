# app/api/tasks - Task Management & Execution

Core endpoint cluster managing task creation, execution, sandbox control, file operations, and PR workflows. 31 routes handling full task lifecycle.

## Domain Purpose
Manage coding task workflows: creation with AI branch/title generation, agent execution in sandboxes, file/PR operations, follow-up messages, sandbox management, deployment tracking.

## Routes Overview

### Core Task CRUD
- **`POST /api/tasks`** - Create task (triggers non-blocking branch/title generation + sandbox processing)
- **`GET /api/tasks`** - List user's tasks (ordered by creation, excludes soft-deleted)
- **`GET /api/tasks/[taskId]`** - Get task details
- **`PATCH /api/tasks/[taskId]`** - Stop task execution
- **`DELETE /api/tasks`** - Soft-delete completed/failed/stopped tasks

### Agent & Sandbox Control
- **`continue/`** - Send follow-up message to task (rate-limited)
- **`start-sandbox/`** - Restart sandbox for task
- **`stop-sandbox/`** - Shutdown sandbox
- **`sandbox-health/`** - Check sandbox status
- **`restart-dev/`** - Restart dev server in sandbox

### File Operations (Sandbox)
- **`files/`** - List project files in sandbox
- **`file-content/`** - Get file contents (with line numbers)
- **`project-files/`** - Get all project files with metadata
- **`save-file/`** - Save changes to file
- **`create-file/`** - Create new file
- **`delete-file/`** - Delete file
- **`create-folder/`** - Create directory
- **`file-operation/`** - Generic file move/copy

### PR Management
- **`pr/`** - Create or update pull request
- **`messages/`** - Get task message history (user + agent)
- **`pr-comments/`** - Get PR review comments
- **`sync-pr/`** - Sync PR state from GitHub
- **`sync-changes/`** - Sync local changes to PR branch
- **`merge-pr/`** - Merge PR
- **`reopen-pr/`** - Reopen closed PR
- **`close-pr/`** - Close PR without merging

### Utilities
- **`deployment/`** - Get deployment info
- **`diff/`** - Get diff of changes
- **`check-runs/`** - Get CI/CD check status
- **`reset-changes/`** - Discard all uncommitted changes
- **`discard-file-changes/`** - Discard changes to specific file
- **`clear-logs/`** - Clear task execution logs
- **`terminal/`** - Execute shell commands in sandbox
- **`lsp/`** - Language server protocol (code intelligence)
- **`autocomplete/`** - Get autocomplete suggestions

## Key Patterns

### Task Creation Flow (POST /api/tasks)
1. Validate user auth + rate limit (20/day)
2. Parse request with `insertTaskSchema` (Zod)
3. Insert task record, return immediately (status: pending)
4. **Non-blocking processes** (via `after()` Next.js 15):
   - Generate AI branch name (5s timeout)
   - Generate AI task title
   - Create sandbox
   - Execute agent
   - Push changes to GitHub
   - Shutdown sandbox (unless keepAlive=true)

### Task Processing Lifecycle
```
pending → processing → completed/error/stopped
         ↑
    - Create sandbox (5min timeout)
    - Wait for branch name generation
    - Execute agent (Claude, Codex, etc.)
    - Push changes to PR
    - Shutdown sandbox
```

### Rate Limiting
- Check per request: `checkRateLimit({ id: user.id, email })`
- Returns: `allowed`, `remaining`, `total`, `resetAt`
- Admin domains: 100/day; regular users: 20/day
- Includes both tasks + follow-ups

### Timeout Management
```typescript
const TASK_TIMEOUT_MS = maxDuration * 60 * 1000
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Task timed out')), TASK_TIMEOUT_MS)
)
await Promise.race([processTask(), timeoutPromise])
```

### Stop Task Logic
- Only stoppable when status = 'processing'
- Sets status = 'stopped', error message
- Kills sandbox process
- Updates task record

### Authentication
- Primary: `getAuthFromRequest()` - Bearer token (API token)
- Fallback: Session cookie
- All routes filter by `eq(tasks.userId, user.id)`

## Async Processing Details

### Branch Name Generation
- Non-blocking (after() function)
- Uses AI Gateway API for descriptive names (e.g., `feature/user-auth-A1b2C3`)
- Fallback to timestamp-based on failure
- Includes 6-char hash to prevent conflicts

### Sandbox Lifecycle
1. Create with: repo clone, env setup, API keys, MCP servers
2. Install dependencies (if installDependencies=true)
3. Execute selected agent
4. Commit + push changes
5. Shutdown or keep alive

### MCP Server Integration
- Fetch user's connected MCP servers
- Decrypt env vars + OAuth secrets
- Pass to agent execution
- Store `mcpServerIds` in task record

## Database Interactions

### tasks table
- All queries filter by `userId`
- Soft delete via `deletedAt` timestamp
- Track: `status`, `progress`, `logs`, `branchName`, `sandboxId`, `sandboxUrl`, `prNumber`, `prUrl`, `agentSessionId`

### taskMessages table
- User prompts and agent responses
- Ordered by `createdAt`
- Enables conversation history

## Error Handling
- Static log messages (no dynamic values)
- Timeout errors caught separately, logged
- Sandbox cleanup on error (unless keepAlive)
- Rate limit exceeded: `429` with reset time
- Task not found: `404`
- Unauthorized: `401`

## Security Notes
- All dynamic values excluded from logs
- User API keys retrieved before after() block (session lost in async context)
- Encrypted: GitHub tokens, API keys, OAuth secrets
- Timeout prevents runaway processes
- Session ID validation (UUID format check)

## Integration Points
- **Sandbox**: `@/lib/sandbox/creation`, `executeAgentInSandbox`
- **Git**: `pushChangesToBranch`, `shutdownSandbox`
- **Agent**: `lib/sandbox/agents/` (claude.ts, codex.ts, etc.)
- **Database**: `tasks`, `taskMessages`, `connectors` tables
- **Crypto**: Decrypt user API keys, GitHub token
- **Rate Limit**: `checkRateLimit` enforcement
- **GitHub**: PR creation, merge, comment fetching
