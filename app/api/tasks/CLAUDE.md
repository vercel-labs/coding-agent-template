# app/api/tasks

32 routes managing full task lifecycle: creation, execution, file ops, PR management, sandbox control.

## Domain Purpose
- Task creation triggers non-blocking sandbox setup, agent execution, branch name generation
- After() returns immediately; processing happens async
- Rate limit enforced per request (tasks + follow-ups combined)

## Local Patterns
- **Non-blocking**: POST /api/tasks returns immediately with status: pending; all sandbox ops via `after()` callback
- **Lifecycle states**: pending → processing → completed/error/stopped
- **Rate limit**: `checkRateLimit({ id: user.id, email })` returns `allowed`, `remaining`, `resetAt`
- **Soft delete**: Tasks via `deletedAt` timestamp, not hard deletion
- **Branch Selection**: Optional `sourceBranch` parameter allows cloning from specific branch (defaults to repo's default branch)

## Route Groups
- CRUD: Create, list, get, stop, soft-delete tasks
- Sandbox: Start/stop/health/restart-dev
- Files: List, get content, save, create, delete, move/copy
- PR: Create, merge, close, reopen, sync, get comments
- Utils: Diff, deployment, check-runs, terminal, LSP, autocomplete

## Integration Points
- **Task processing**: `@/lib/tasks/process-task.ts` (processTaskWithTimeout - sandbox creation, agent execution, Git ops)
- **Sandbox**: `@/lib/sandbox/creation`, `executeAgentInSandbox`
- **Git**: Branch name generation, push, PR operations
- **Agents**: `lib/sandbox/agents/` (claude, codex, etc.)
- **Database**: `tasks`, `taskMessages`, `connectors` tables
- **Rate Limit**: `@/lib/utils/rate-limit.ts`
- **Crypto**: Decrypt user API keys before after() block

## Key Files
- `route.ts` - Task CRUD (POST uses after() to call processTaskWithTimeout)
- `[taskId]/route.ts` - Get/stop task
- Subdirectories handle domain-specific routes (sandbox, files, pr, etc.)
