# Utils Module

## Domain Purpose
Cross-cutting utilities: TaskLogger (static-string logging with sub-agent tracking), redaction, rate limiting, ID generation, branch/commit naming.

## Module Boundaries
- **Owns**: Log manipulation, formatting, utility functions, agent context tracking
- **Delegates to**: `lib/db/` for DB operations, Vercel AI SDK 5 for branch name generation

## Local Patterns (CRITICAL)
- **TaskLogger Static Strings**: NEVER log dynamic values (taskId, userId, paths). Example: `.info('Operation started')` NOT `.info('Task ${id} started')`
- **Agent Context**: TaskLogger tracks which agent logged (primary or sub-agent) via AgentSource, visible in UI
- **Sub-Agent Tracking**: TaskLogger methods for managing sub-agent lifecycle (start, running, complete) with automatic database atomicity
- **Heartbeat Mechanism**: All log operations update `lastHeartbeat` for timeout extension during long tasks
- **Redaction Patterns**: API keys (sk-ant-, sk-*, ghp_*/gho_*/ghu_*/ghs_*/ghr_*, vck_*), GitHub tokens in URLs, Vercel IDs, generic patterns (BEARER, TOKEN=, API_KEY=)
- **Rate Limit Calculation**: Count tasks + user messages created **today (UTC)**; Standard 20/day, Admin 100/day
- **ID Generation**: CUID2 format (~21 chars, URL-safe)
- **Branch Name Format**: `{type}/{description}-{6-char-hash}` (AI-generated via Vercel AI SDK, non-blocking, fallback to timestamp)
- **Soft Deletes**: Rate limit excludes deleted tasks from count

## TaskLogger API
- `.info(message)` - Log info message
- `.command(message)` - Log command execution
- `.error(message)` - Log error
- `.success(message)` - Log success
- `.subagent(message, subAgentName, parentAgent?)` - Log sub-agent event
- `.startSubAgent(name, description?, parentAgent?)` - Create and track sub-agent (returns ID)
- `.subAgentRunning(subAgentId)` - Mark sub-agent as running
- `.completeSubAgent(subAgentId, success)` - Mark sub-agent as completed/failed
- `.heartbeat()` - Send activity heartbeat for timeout extension
- `.updateProgress(progress, message)` - Update progress with message
- `.updateStatus(status, message?)` - Update task status
- `.withAgentContext(context)` - Create logger with specific agent context

## Integration Points
- `lib/sandbox/creation.ts`, `lib/sandbox/agents/` - TaskLogger for operations
- `app/api/tasks/route.ts` - checkRateLimit() before creating task
- `app/api/tasks/[id]/messages/route.ts` - checkRateLimit() for follow-ups
- `lib/utils/logging.ts` - redactSensitiveInfo(), AgentSource tracking, createSubAgentLog()

## Key Files
- `task-logger.ts` - TaskLogger class with sub-agent methods, heartbeat, agent context
- `logging.ts` - redactSensitiveInfo(), createLogEntry(), AgentSource, createSubAgentLog()
- `rate-limit.ts` - checkRateLimit() enforcement with UTC date calculations
- `id.ts` - generateId() (CUID2 format)
- `branch-name-generator.ts` - generateBranchName(), createFallbackBranchName() with Vercel AI SDK
- `commit-message-generator.ts` - generateCommitMessage() for auto-generated commit messages
- `title-generator.ts` - generateTaskTitle() for AI-generated task titles
