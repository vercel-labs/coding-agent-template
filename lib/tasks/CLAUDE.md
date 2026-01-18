# Tasks Module

## Domain Purpose
Centralized task execution pipeline: validation, sandbox creation, agent execution, Git operations, and completion handling. Shared logic for REST API and MCP tool handlers with sub-agent tracking and heartbeat-aware timeout extension.

## Module Boundaries
- **Owns**: Task processing workflow, GitHub token re-validation, URL validation, timeout management, branch/title generation, sub-agent activity tracking
- **Delegates to**: `lib/sandbox/` for sandbox creation/cleanup, `lib/sandbox/agents/` for agent execution, `lib/sandbox/git.ts` for push operations, `lib/utils/task-logger.ts` for logging

## Local Patterns
- **GitHub Re-Validation**: Check token freshness BEFORE sandbox creation; return early with error if revoked
- **URL Validation**: Strict regex match for GitHub URLs (`https://github.com/owner/repo` format only)
- **Non-Blocking Generation**: `generateTaskBranchName()`, `generateTaskTitleAsync()` fire via `after()` for async completion
- **Timeout Handling**: Base timeout + 5-minute grace period for active sub-agents; warning at T-1min
- **Task Message Logging**: Insert user prompt as taskMessage on task start
- **Heartbeat-Aware Timeout**: `lastHeartbeat` tracks activity; extends deadline if sub-agents are running
- **Activity Checking**: `checkTaskActivity()` queries task for sub-agent status and heartbeat age

## Timeout Extension Logic
- **Interval**: Check every 30 seconds during task execution
- **Grace Period**: 5 minutes for active sub-agents (extends deadline)
- **Absolute Max**: Cannot exceed base timeout + grace period
- **Conditions**: Only extends if `hasActiveSubAgents && lastHeartbeat < 5min old`
- **Race Prevention**: Checks task status before marking timeout (prevents double-fail)

## Integration Points
- `app/api/tasks/route.ts` - REST API calls `processTaskWithTimeout()` for task creation
- `app/api/mcp/route.ts` - MCP tool handler calls `processTaskWithTimeout()` for external clients
- `lib/utils/task-logger.ts` - Log task progress, status updates, sub-agent tracking, heartbeats
- `lib/sandbox/creation.ts` - Creates sandbox with validation results

## Key Files
- `process-task.ts` - Main `processTaskWithTimeout()`, `processTask()`, `checkTaskActivity()`, generation helpers, validators
