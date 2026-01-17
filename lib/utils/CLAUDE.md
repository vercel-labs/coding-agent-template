# Utils Module

## Domain Purpose
Cross-cutting utilities: TaskLogger (static-string logging), redaction, rate limiting, ID generation, branch/commit naming.

## Module Boundaries
- **Owns**: Log manipulation, formatting, utility functions
- **Delegates to**: `lib/db/` for DB operations, Vercel AI SDK 5 for branch name generation

## Local Patterns (CRITICAL)
- **TaskLogger Static Strings**: NEVER log dynamic values (taskId, userId, paths). Example: `.info('Operation started')` NOT `.info('Task ${id} started')`
- **Redaction Patterns**: API keys (sk-ant-, sk-*, ghp_*/gho_*/ghu_*/ghs_*/ghr_*, vck_*), GitHub tokens in URLs, Vercel IDs, generic patterns (BEARER, TOKEN=, API_KEY=)
- **Rate Limit Calculation**: Count tasks + user messages created **today (UTC)**; Standard 20/day, Admin 100/day
- **ID Generation**: CUID2 format (~21 chars, URL-safe)
- **Branch Name Format**: `{type}/{description}-{6-char-hash}` (AI-generated via Vercel AI SDK, non-blocking, fallback to timestamp)
- **Soft Deletes**: Rate limit excludes deleted tasks from count

## Integration Points
- `lib/sandbox/creation.ts`, `lib/sandbox/agents/` - TaskLogger for operations
- `app/api/tasks/route.ts` - checkRateLimit() before creating task
- `app/api/tasks/[id]/messages/route.ts` - checkRateLimit() for follow-ups
- `lib/utils/logging.ts` - redactSensitiveInfo() before logging any dynamic values

## Key Files
- `task-logger.ts` - TaskLogger class with .info(), .command(), .error(), .success(), .updateProgress()
- `logging.ts` - redactSensitiveInfo(), createLogEntry()
- `rate-limit.ts` - checkRateLimit()
- `id.ts` - generateId() (CUID2)
