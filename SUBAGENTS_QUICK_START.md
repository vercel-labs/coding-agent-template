# Subagent Quick Start Guide
## How to Use the 5 Recommended Claude Code Subagents

This document provides practical examples and invocation patterns for each subagent. Use this as a reference when delegating tasks to custom agents.

---

## 1. TypeScript API Route Architect

### What It Does
Generates production-ready API routes with full session validation, rate limiting, request validation, user scoping, standardized error handling, and static-string logging.

### When to Use
- Creating new API endpoints
- Standardizing existing API routes
- Adding endpoints to existing route collections
- Generating type-safe response schemas

### Invocation Pattern

#### Example 1: Create a New Endpoint
```
Task: Create a new API route

Please create GET /api/tasks/[id]/logs endpoint that:
1. Validates user session
2. Checks rate limit
3. Returns filtered task logs for the authenticated user only
4. Applies proper error handling
5. Uses static-string logging only (no dynamic values)

Context:
- Task schema: lib/db/schema.ts (lines 76-113)
- Log entry type: LogEntry[] in tasks table
- Reference implementation: /api/tasks/route.ts
- User scoping: filter by session.user.id

Expected output:
- Fully typed route handler
- Zod validation schema for query params
- TypeScript response type
- Error handling with proper HTTP status codes
```

#### Example 2: Refactor Existing Routes
```
Task: Standardize error responses

Please refactor all /api/github/* routes to use consistent error response format:
1. Audit current error handling patterns
2. Create unified error response type
3. Update all routes to use standard error schema
4. Ensure all errors include actionable message (no leaking internals)
5. Validate static-string logging compliance

Reference:
- Current routes: /api/github/*/
- Pattern reference: /api/tasks/route.ts (how errors should look)
```

#### Example 3: Generate Type-Safe SDK
```
Task: Generate TypeScript types for frontend

Please create type definitions for all API response shapes:
1. Analyze all /api/* route responses
2. Extract response types from current implementations
3. Generate OpenAPI/TypeScript definitions
4. Create frontend SDK types from Drizzle schema

Expected output:
- lib/api-types.ts with all response types
- Request/response validation helpers
- Type guards for runtime safety
```

### Key Parameters
- `route_path` - Full path like `/api/tasks/[id]/logs`
- `http_method` - GET, POST, PUT, DELETE, etc.
- `auth_required` - Always true for this platform
- `user_scoped` - Filter by userId (always true)
- `request_schema` - Zod schema for validation
- `response_type` - TypeScript type for response

### Expected Output Quality
✓ Passes `pnpm type-check` without errors
✓ Passes `pnpm lint` without warnings
✓ All log statements are static strings (no dynamic values)
✓ All sensitive data redacted in logs
✓ Proper HTTP status codes (401, 403, 404, 429, 500)
✓ Rate limit checks included
✓ User scoping enforced (no cross-user access)

---

## 2. Database Schema & Query Optimizer

### What It Does
Designs tables, generates migrations, creates type-safe query helpers, validates relationships, ensures encryption coverage, and optimizes queries for common patterns.

### When to Use
- Adding new tables to store data
- Modifying existing schema
- Creating helper functions for common queries
- Optimizing slow queries
- Ensuring encryption on sensitive fields

### Invocation Pattern

#### Example 1: Add a New Table
```
Task: Design and implement new table for feature

Please add a 'taskArtifacts' table to store generated files/outputs from tasks:
1. Design schema with proper relationships:
   - Link to tasks table (foreign key)
   - Link to users table (for access control)
   - Include: artifact type, file path, size, created timestamp
   - Soft delete support (deletedAt)

2. Generate Drizzle migration:
   - Create migration file in lib/db/migrations/
   - Include indexes for common queries

3. Create Zod schemas:
   - insertTaskArtifactSchema
   - selectTaskArtifactSchema

4. Generate query helpers:
   - getArtifactsByTask(taskId, userId)
   - getArtifactsByUser(userId)
   - deleteArtifactsByTask(taskId, userId)

Context:
- Existing schema: lib/db/schema.ts
- Similar tables: tasks, connectors
- User scoping pattern: always filter by userId
- Encryption: NO sensitive data in this table
```

#### Example 2: Create Query Helpers
```
Task: Generate query helper functions

Please create helper functions for common task queries:
1. getUserTasks(userId, options?: { status?, limit?, offset? })
   - Filter by user
   - Optionally filter by status
   - Paginate results

2. getTaskWithMessages(taskId, userId)
   - Get task with all task messages
   - Ensure user owns the task

3. countUserTasksByStatus(userId)
   - Return { pending: N, processing: N, completed: N, error: N }

Location: Create lib/db/queries.ts
Type Safety: Full TypeScript inference from schema
User Scoping: All queries must filter by userId
```

#### Example 3: Ensure Encryption Coverage
```
Task: Audit and ensure all sensitive fields are encrypted

Please:
1. Scan schema.ts for all tables
2. Identify sensitive fields:
   - API keys (keys.value, connectors.oauthClientSecret)
   - OAuth tokens (users.accessToken, accounts.accessToken)
   - Connector environment variables (connectors.env)
3. Verify all are encrypted at rest
4. Create migration for any missing encryption
5. Update encrypt/decrypt calls if needed

Reference:
- Encryption function: lib/crypto.ts
- Example encrypted fields: keys.value (line 325), users.accessToken (line 23)
```

### Key Parameters
- `table_name` - Drizzle table identifier (e.g., `connectors`)
- `fields` - Array of field definitions with types
- `relationships` - Foreign key relationships
- `user_scoped` - Always true for this platform
- `soft_delete` - Include deletedAt field (usually true)
- `encryption_fields` - Fields requiring encryption

### Expected Output Quality
✓ Migration generates valid SQL
✓ Zod schemas match Drizzle types
✓ Foreign key relationships validated
✓ User scoping enforced in queries
✓ Sensitive fields encrypted
✓ Indexes created for common filters
✓ Migration can be rolled back cleanly

---

## 3. Security & Logging Enforcer

### What It Does
Audits code for security vulnerabilities, enforces static-string logging, validates encryption coverage, detects data leakage, and prevents credential exposure.

### When to Use
- Code review before deployment
- Pre-commit hook execution
- Onboarding new team members
- Responding to security incidents
- Validating third-party contributions

### Invocation Pattern

#### Example 1: Full Security Audit
```
Task: Comprehensive security audit of codebase

Please perform full security scan:

1. LOGGING COMPLIANCE (Critical)
   - Scan all logger.* calls for dynamic values
   - Find violations like: logger.error(`Failed: ${error.message}`)
   - Flag any line that would leak: taskId, userId, tokens, file paths
   - List violations with file:line

2. ENCRYPTION COVERAGE
   - Verify all sensitive fields encrypted:
     * API keys (keys.value)
     * OAuth tokens (users.accessToken, accounts.accessToken)
     * Connector secrets (connectors.env, oauthClientSecret)
   - Flag any unencrypted sensitive field

3. DATA LEAKAGE PATTERNS
   - Search for: console.log, console.error containing dynamic values
   - Search for: error messages that include error.message, error.stack
   - Search for: template literals in logging

4. USER SCOPING
   - Verify all DB queries filter by userId
   - Check API routes validate user.id before data access
   - Flag any unscoped queries

5. CREDENTIAL PROTECTION
   - Ensure no hardcoded tokens in code
   - Verify all env vars loaded from process.env
   - Check sandbox commands redact credentials in logs

Output: Detailed report with:
- Violations by severity (Critical/High/Medium)
- File:line references
- Current code (redacted)
- Recommended fix
- Compliance checklist
```

#### Example 2: Pre-Deployment Security Check
```
Task: Security validation before production deployment

Files to check:
- All files changed in current PR
- lib/sandbox/agents/*
- All modified API routes

Specific checks:
1. All new log statements use static strings only
2. All new sensitive fields are encrypted
3. All new API routes filter by userId
4. No new console.log/error statements
5. Redaction patterns cover any new API key formats

Output: Go/No-Go decision with reasoning
```

#### Example 3: Update Redaction Patterns
```
Task: Add redaction support for new OAuth provider

Provider: GitHub App Installation Token (ghu_XXXXX)

Please:
1. Add regex pattern to lib/utils/logging.ts for: ghu_[a-zA-Z0-9_]{20,}
2. Update redactSensitiveInfo() function
3. Add test case verifying redaction works
4. Document in CLAUDE.md security section

Pattern should redact like: ghu_XXXX****XXXX (show first 4, last 4, hide middle)
```

### Key Parameters
- `scan_scope` - Paths to scan (e.g., lib/sandbox/agents/*, app/api/*)
- `severity_filter` - Minimum severity to report (Critical, High, Medium, Low)
- `check_types` - Which checks to run (logging, encryption, leakage, scoping, credentials)
- `output_format` - JSON, markdown, or HTML report

### Expected Output Quality
✓ Finds 100% of dynamic log statements (no false negatives)
✓ Validates encryption on sensitive fields
✓ Reports actionable violations (file:line, fix suggestion)
✓ Zero false positives (no legitimate code flagged)
✓ Can be automated in CI/CD pipeline

### Common Violations Found
- `logger.info(\`Task created: ${taskId}\`)` ← taskId is dynamic
- `console.error(error.message)` ← leaks error details
- `keys.value` not encrypted ← sensitive field unprotected
- `db.select().from(tasks)` without userId filter ← unscoped query

---

## 4. Sandbox & Agent Lifecycle Manager

### What It Does
Unifies agent implementations, manages sandbox lifecycle state transitions, handles error recovery, manages session persistence, and standardizes dependency detection.

### When to Use
- Adding support for new AI agent
- Fixing bugs in agent execution
- Improving sandbox reliability
- Handling edge cases in multi-turn conversations
- Optimizing sandbox resource usage

### Invocation Pattern

#### Example 1: Create New Agent Executor
```
Task: Generate executor for new OpenRouter agent

Requirements:
1. Support any model via OpenRouter API
2. Follow unified agent pattern
3. Stream output using streaming JSON format (like Claude agent)
4. Handle API key validation
5. Support model parameter override

Implementation checklist:
- Create lib/sandbox/agents/openrouter.ts
- Export executeOpenRouterInSandbox() function
- Implement installOpenRouterCLI() helper
- Add environment configuration
- Add error handling with retries
- Ensure static-string logging

Reference agent:
- lib/sandbox/agents/claude.ts (most complete implementation)
- Similar pattern: streaming output, session handling

Output:
- Fully implemented agent executor
- Integration with sandbox orchestration
- Unit test file
- Documentation in README
```

#### Example 2: Fix Session Resumption Bug
```
Task: Fix session resumption for Claude agent follow-ups

Current issue:
- sessionId not being extracted correctly from streaming output
- Follow-up messages fail on resume with "session not found"

Debug info:
- Session ID should be in 'result' chunk type
- Streaming JSON format: {"type": "result", "session_id": "..."}
- Line 488 in claude.ts currently extracts but may have parsing issue

Please:
1. Analyze streaming output parsing logic (line 412-500)
2. Add logging for session ID extraction (static strings only)
3. Validate session ID format
4. Add fallback session detection
5. Create test cases for session resumption

Expected fix:
- Session resumption works reliably
- Appropriate error messages on session failure
- Cleaner code (simplify parsing logic if possible)
```

#### Example 3: Improve Sandbox Error Recovery
```
Task: Add retry logic and error recovery to sandbox creation

Current gaps:
- No retry on transient network failures
- Git clone failures are not retried
- Dependency install errors cause immediate failure

Implementation:
1. Add exponential backoff retry helper
   - Max 3 retries for transient errors
   - 1s, 3s, 9s delays
   - Config for max retries

2. Identify retryable errors:
   - Network timeouts
   - Transient Git failures
   - Dependency install conflicts (certain patterns)

3. Add fallback strategies:
   - If npm fails, try yarn
   - If git clone fails with auth, check token validity
   - If install fails, log detailed error for user

4. Add comprehensive logging (static strings):
   - "Retry attempt 1 of 3 for operation X"
   - "Exponential backoff: 3s delay"
   - "Fallback strategy activated"

Location: lib/sandbox/creation.ts
Reference: Error handling in createSandbox()
```

### Key Parameters
- `agent_type` - claude, codex, copilot, cursor, gemini, openrouter, etc.
- `operation` - install, execute, resume, cleanup
- `error_type` - Network, Auth, Timeout, Parse, Resource
- `retry_strategy` - exponential_backoff, linear, none

### Expected Output Quality
✓ Agent executors follow unified pattern
✓ Error recovery reduces "stuck sandbox" incidents by 80%+
✓ Session resumption works reliably for multi-turn
✓ Streaming output parsed correctly
✓ Static-string logging throughout
✓ Integration tests pass for happy path and error cases

---

## 5. React Component & UI Pattern Library

### What It Does
Creates consistent component patterns, enforces shadcn/ui adoption, generates form builders, ensures accessibility, and documents component usage.

### When to Use
- Building new UI features
- Refactoring existing components
- Standardizing form patterns
- Ensuring accessibility compliance
- Creating component documentation

### Invocation Pattern

#### Example 1: Generate Component from Schema
```
Task: Create TaskForm component from database schema

Requirements:
1. Use insertTaskSchema for validation (lib/db/schema.ts, line 116)
2. Auto-bind Zod validation to form fields
3. Include all fields from schema:
   - prompt (required, text)
   - title (optional, text)
   - repoUrl (required, URL)
   - selectedAgent (required, select dropdown)
   - selectedModel (optional, text)
   - installDependencies (optional, checkbox)
   - maxDuration (required, select from 5min to 5hr)
   - keepAlive (optional, toggle)

4. Use shadcn/ui components:
   - Form (react-hook-form + zod)
   - Input for text fields
   - Select for dropdowns
   - Checkbox for boolean
   - RadioGroup or Toggle for maxDuration selector
   - Button for submit

5. Features:
   - Real-time validation error messages
   - Disabled submit while validating
   - Loading spinner on submit
   - Success/error toast notifications
   - Pre-fill form from URL params if creating task for repo

Location: components/task-form.tsx (replace or enhance existing)
Accessibility: WCAG 2.1 AA compliant (labels, error messages, keyboard nav)
Dark mode: Support via existing next-themes integration

Reference:
- Schema: lib/db/schema.ts lines 116-145
- Similar forms in codebase: components/api-keys-dialog.tsx
```

#### Example 2: Build Type-Safe Data Table
```
Task: Create task list data table with filtering and sorting

Requirements:
1. Display tasks in table format with columns:
   - Title
   - Status (pending/processing/completed/error)
   - Repository
   - Agent used
   - Created date
   - Actions (view, edit, delete)

2. Features:
   - Sort by any column
   - Filter by status
   - Filter by agent
   - Pagination (default 20 per page)
   - Select multiple rows for bulk delete
   - Show task count

3. Type safety:
   - Extract types from selectTaskSchema
   - Ensure all columns match Task type
   - API client generates data with proper types

4. Performance:
   - Virtual scrolling if table > 100 rows
   - Lazy load task details on expand

5. Accessibility:
   - Keyboard navigation (Tab, Arrow keys)
   - Screen reader support (ARIA labels)
   - Focus management

Use: shadcn/ui table, checkbox, button, dropdown-menu
Reference:
- Similar pattern: file-browser.tsx
- Data fetching: API call to /api/tasks
- Schema: selectTaskSchema (lib/db/schema.ts, line 147)
```

#### Example 3: Accessibility Audit & Fixes
```
Task: Audit all components for WCAG 2.1 AA compliance and fix violations

Scope: All components in components/ directory

Checks:
1. Color contrast (text must be 4.5:1 on background)
2. Interactive elements (buttons, links, inputs)
   - Keyboard accessible (Tab navigation)
   - Focus visible (outline or highlight)
   - Minimum 44x44px touch target
3. Form labels
   - Every input has associated label
   - Error messages linked to inputs
4. Images & icons
   - Have alt text or aria-label
   - Decorative images have aria-hidden
5. Semantic HTML
   - Proper heading hierarchy (h1, h2, etc.)
   - Lists use <ul>/<ol>
   - Navigation uses <nav>
6. ARIA attributes
   - Live regions for updates (task status)
   - Roles for custom components
   - aria-label for icon buttons

Output:
- Audit report with violations by severity
- Code changes to fix violations
- Updated components following a11y patterns
- Accessibility testing guide (manual checks)

Tools:
- axe-core patterns
- WCAG 2.1 AA checklist
- Dark mode contrast validation
```

### Key Parameters
- `component_type` - Form, DataTable, Dialog, Card, Page Layout
- `data_source` - Drizzle schema table for type inference
- `ui_framework` - shadcn/ui (always)
- `accessibility_level` - WCAG 2.1 AA (required)
- `dark_mode` - Support via next-themes

### Expected Output Quality
✓ Components are type-safe (no `any` types)
✓ Forms have automatic Zod validation
✓ All shadcn/ui components properly imported
✓ Passes accessibility audit (WCAG 2.1 AA)
✓ Works in light and dark mode
✓ Responsive on mobile/tablet/desktop
✓ Includes JSDoc comments with prop descriptions
✓ Tested with keyboard navigation

---

## Integration Checklist

### Before Delegating a Task
- [ ] Task is scoped and specific (not vague)
- [ ] Reference implementation or pattern provided
- [ ] Expected output format clearly described
- [ ] File paths are absolute (not relative)
- [ ] Context includes relevant schema/type definitions
- [ ] Success criteria are measurable

### After Receiving Output
- [ ] Run `pnpm type-check` (no errors)
- [ ] Run `pnpm lint` (no warnings)
- [ ] Run `pnpm format --check` (formatting correct)
- [ ] Review generated code for:
  - Static-string logging (no dynamic values)
  - User scoping (all queries filter by userId)
  - Encryption on sensitive fields
  - Proper error handling
- [ ] Test in feature branch before merging
- [ ] Update documentation if APIs changed

### Quality Gates
✓ All TypeScript compiles without errors
✓ All tests pass (existing and new)
✓ No security vulnerabilities (static analysis)
✓ Code follows team conventions
✓ Documentation is accurate and complete

---

## Common Patterns to Enforce

### Static String Logging (CRITICAL)
```typescript
// ✓ CORRECT
await logger.info('Task started')
await logger.command('$ claude --version')
await logger.error('Failed to initialize agent')

// ✗ WRONG - Dynamic values leak data
await logger.info(`Task started: ${taskId}`)  // taskId is dynamic
await logger.error(`Failed: ${error.message}`)  // Error details leak internals
await logger.command(`$ ${cmd} ${args.join(' ')}`)  // Args may contain tokens
```

### User Scoping (CRITICAL)
```typescript
// ✓ CORRECT - Filters by userId
const task = await db.select().from(tasks)
  .where(and(eq(tasks.userId, user.id), eq(tasks.id, taskId)))

// ✗ WRONG - No user filter (security gap)
const task = await db.select().from(tasks)
  .where(eq(tasks.id, taskId))
```

### Type Safety
```typescript
// ✓ CORRECT - Full type inference
const validatedTask = insertTaskSchema.parse(body)
const response: Response = { task: newTask, message: 'Created' }

// ✗ WRONG - Loses type information
const validatedTask: any = body  // No validation
const response = { task: newTask }  // No type def
```

---

## Emergency Contact

If a subagent produces incorrect output:
1. Provide failing example (file path, line number)
2. Show expected vs. actual output
3. Share relevant schema/type definitions
4. Re-invoke with more specific constraints
5. Consider breaking task into smaller pieces

---

## Appendix: Subagent Selection Matrix

| Need | Best Agent | Why |
|------|----------|-----|
| New API endpoint | TypeScript API Route Architect | Standardized pattern, validation |
| New database table | Database Schema & Query Optimizer | Relationships, migrations, types |
| Security review | Security & Logging Enforcer | Detects violations, automated |
| Fix agent bug | Sandbox & Agent Lifecycle Manager | Understands state, error handling |
| New UI component | React Component & UI Pattern Library | shadcn/ui, accessibility, types |
| Multiple concerns | Start with Security Enforcer first | Baseline then build |

---

**Last Updated:** January 15, 2026
**Status:** Ready for Agent Invocation
**Prepared For:** AA Coding Agent Development Team
