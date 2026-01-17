# Tasks Module

## Domain Purpose
Centralized task execution pipeline: validation, sandbox creation, agent execution, Git operations, and completion handling. Shared logic for REST API and MCP tool handlers.

## Module Boundaries
- **Owns**: Task processing workflow, GitHub token re-validation, URL validation, timeout management, branch/title generation
- **Delegates to**: `lib/sandbox/` for sandbox creation/cleanup, `lib/sandbox/agents/` for agent execution, `lib/sandbox/git.ts` for push operations

## Local Patterns
- **GitHub Re-Validation**: Check token freshness BEFORE sandbox creation; return early with error if revoked
- **URL Validation**: Strict regex match for GitHub URLs (`https://github.com/owner/repo` format only)
- **Non-Blocking Generation**: `generateTaskBranchName()`, `generateTaskTitleAsync()` fire via `after()` for async completion
- **Timeout Handling**: 5-minute max; warning logged at T-1min; force completion on timeout
- **Task Message Logging**: Insert user prompt as taskMessage on task start

## Integration Points
- `app/api/tasks/route.ts` - REST API calls `processTaskWithTimeout()` for task creation
- `app/api/mcp/route.ts` - MCP tool handler calls `processTaskWithTimeout()` for external clients
- `lib/utils/task-logger.ts` - Log task progress, status updates, errors
- `lib/sandbox/creation.ts` - Creates sandbox with validation results

## Key Files
- `process-task.ts` - Main `processTaskWithTimeout()`, `processTask()`, generation helpers, validators
