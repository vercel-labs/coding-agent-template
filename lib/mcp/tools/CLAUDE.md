# MCP Tools Module

## Domain Purpose
Implement MCP tool handlers: task CRUD, execution control, and external API integration. Each tool validates input, checks auth/rate limits, and delegates to core logic.

## Module Boundaries
- **Owns**: Tool-specific validation, request dispatch, error formatting, MCP-protocol compliance
- **Delegates to**: `lib/tasks/process-task.ts` for execution, `lib/db/` for CRUD, `lib/auth/` for auth checks, `lib/utils/rate-limit.ts` for limits

## Local Patterns
- **Tool Handler Signature**: `McpToolHandler<TInput>` accepts input + context (userId, token from auth header)
- **Error Response Format**: `{ error, message, hint?, field?, ...context }` with `isError: true`
- **Success Response**: Task object or confirmation with `isError: false`
- **Validation Order**: Auth → Rate limit → Domain logic → Core service call
- **GitHub Verification**: `create-task` verifies GitHub connection before task creation
- **Internal API Calls**: `create-task` uses Bearer token to call `/api/tasks` (delegates to REST flow)

## Integration Points
- `app/api/mcp/route.ts` - Dispatches requests to tool handlers
- `lib/tasks/process-task.ts` - Called by create-task via internal API
- `lib/db/` - Task CRUD operations
- `lib/auth/api-token.ts` - Token extraction from context

## Key Files
- `create-task.ts` - Create + execute task; internal API call flow
- `get-task.ts`, `continue-task.ts`, `stop-task.ts`, `list-tasks.ts` - Standard CRUD handlers
- `index.ts` - Tool registry and dispatcher
