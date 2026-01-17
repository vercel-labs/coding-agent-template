# Utils Module

## Domain Purpose
Provide cross-cutting utilities for logging, rate limiting, ID generation, URL validation, and UI helpers used throughout the application.

## Key Responsibilities
- **Task Logging**: Real-time log streaming to database with TaskLogger class
- **Sensitive Data Redaction**: Redact API keys, tokens, credentials from all logs
- **Rate Limiting**: Check daily message limits per user (tasks + follow-ups)
- **ID Generation**: Generate unique IDs for tasks, users, etc. (CUID2)
- **Branch/Commit Naming**: Generate AI-friendly branch and commit names
- **Admin Detection**: Identify admin users from email domain whitelist
- **Data Formatting**: Number formatting, relative URLs, titles
- **Logging Helpers**: Create structured log entries with types

## Module Boundaries
- **Delegates to**: `lib/db/client.ts`, `lib/db/schema.ts` for DB operations
- **Delegates to**: `lib/crypto.ts` (no crypto in this module; referenced only)
- **Delegates to**: Vercel AI SDK 5 for branch name generation
- **Owned**: Log manipulation, formatting, utility functions

## Core Files & Patterns

### task-logger.ts
```typescript
class TaskLogger {
  append(type, message)    // Low-level append to logs JSONB
  info/command/error/success(message)  // Convenience methods
  updateProgress(percent, message)     // Update progress + log
  command(cmd)             // Log shell commands (redacted)
}
```
- **Usage**: Pass to sandbox/agent execution for real-time logging
- **DB Updates**: Append LogEntry to tasks.logs array (not replace)
- **Static Strings**: NEVER include dynamic values (taskId, userId, file paths)

### logging.ts
```typescript
redactSensitiveInfo(message: string)  // Redact tokens, keys, IDs
createLogEntry(type, message, timestamp)
createInfoLog(msg) / createCommandLog(cmd) / createErrorLog(msg) / createSuccessLog(msg)
```
- **Patterns Redacted**:
  - API keys (sk-ant-, sk-*, gh[phosr]_*, vck_*)
  - GitHub tokens in URLs (https://token@github.com)
  - Vercel IDs (SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID, SANDBOX_VERCEL_TOKEN)
  - Generic patterns (BEARER, TOKEN=, API_KEY=, etc.)
- **Used In**: All log calls in sandbox/agents; commands before execution
- **Test Logs**: Safe for UI display; no sensitive data leakage

### rate-limit.ts
```typescript
checkRateLimit(user: { id, email })
  → { allowed, remaining, total, resetAt }
```
- **Calculation**: Count tasks + user messages created today (UTC)
- **Limits**: 20 (standard) or 100 (admin) per day
- **Override**: Per-user setting in settings table
- **Soft Deletes**: Exclude deleted tasks from count
- **Used In**: API routes before creating task or follow-up

### branch-name-generator.ts
```typescript
generateBranchName(prompt: string)  // AI-generated via Vercel AI SDK
  → "feature/description-HASH" or fallback to timestamp
```
- **Async**: Non-blocking via Next.js after() function
- **Format**: `{type}/{description}-{6-char-hash}`
- **Fallback**: Timestamp-based if generation fails
- **Hash Purpose**: Prevent branch name collisions
- **Used In**: Task creation; stored for git operations

### commit-message-generator.ts
```typescript
generateCommitMessage(prompt: string)
  → "Summary message based on task prompt"
```
- **Format**: ~50 characters; past tense (e.g., "Added user auth")
- **AI-Generated**: Via Vercel AI SDK 5
- **Used In**: Git commit operations in sandbox

### id.ts
```typescript
generateId()  // Return CUID2 (URL-safe unique ID)
```
- **Length**: ~21 characters
- **Purpose**: Task IDs, user IDs, connector IDs
- **Collision**: Cryptographically secure; no collisions in practice

### Other Utilities
- **admin-domains.ts**: `isAdminUser(user)` - check email against whitelist
- **format-number.ts**: `formatNumber()` - human-readable numbers
- **is-relative-url.ts**: `isRelativeUrl()` - validate relative paths
- **title-generator.ts**: `generateTitle()` - create task titles
- **cookies.ts**: Cookie utilities (used in session management)

## Local Patterns
- **Static Logging**: TaskLogger.info('Operation started') - NOT "Task ${id} started"
- **Redaction First**: Call redactSensitiveInfo() BEFORE logging any dynamic values
- **Error Messages**: Log static error types, not stack traces with sensitive data
- **Timestamps**: LogEntry includes ISO timestamp; TaskLogger adds automatically
- **No Async Failure**: TaskLogger methods swallow DB errors; don't break main process

## Integration Points
- **lib/sandbox/creation.ts**: TaskLogger for all sandbox operations
- **lib/sandbox/agents/**: TaskLogger for agent execution; redactSensitiveInfo() for commands
- **app/api/tasks/route.ts**: checkRateLimit() before creating task
- **app/api/tasks/[id]/messages/route.ts**: checkRateLimit() for follow-ups
- **all API routes**: getMaxMessagesPerDay() for custom limits
- **components/branch-name.ts**: generateBranchName() displayed in UI

## Common Workflows
1. **Log Task Operation**: Create TaskLogger(taskId) → Call .info('message') throughout
2. **Check Rate Limit**: Call checkRateLimit(user) → If not allowed, return 429
3. **Generate Branch Name**: Call generateBranchName(prompt) → Store in task.branchName
4. **Redact Command**: Call redactSensitiveInfo(command) → Pass to logger.command()
5. **Update Progress**: Call logger.updateProgress(50, 'message') → UI shows progress bar

## Gotchas & Edge Cases
- **Task Logger DB Errors**: Silent failures prevent main process from breaking
- **Redaction Regex**: Complex patterns for API keys; test with actual token formats
- **Rate Limit UTC**: Uses UTC for day boundaries (not user's local timezone)
- **Branch Name Gen**: AI call is non-blocking; UI displays while waiting
- **Log Array Growth**: logs JSONB array grows with each append (1000+ entries possible)
- **Admin Domain Env**: NEXT_PUBLIC_ADMIN_EMAIL_DOMAINS comma-separated list
