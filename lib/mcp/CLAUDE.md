# MCP Module

## Domain Purpose
Implement Model Context Protocol (MCP) server for external MCP clients (Claude Desktop, Cursor, Windsurf) to create and manage coding tasks programmatically.

## Key Responsibilities
- **Protocol Handler**: MCP over HTTP; streamable transport; request/response handling
- **Tool Implementation**: 5 MCP tools (create-task, get-task, continue-task, list-tasks, stop-task)
- **Authentication**: Dual-auth via Bearer token query parameter or Authorization header
- **Request Validation**: Zod schema validation for all tool inputs
- **User Scoping**: Enforce userId access control; prevent cross-user access
- **Rate Limiting**: Same daily message limits as web UI

## Module Boundaries
- **Delegates to**: `lib/auth/api-token.ts` for token authentication
- **Delegates to**: `lib/db/` for task CRUD operations
- **Delegates to**: `app/api/tasks/` route logic for task execution
- **Delegates to**: `lib/utils/rate-limit.ts` for daily limits
- **Owned**: MCP protocol handling, tool schemas, request dispatch

## Core Types & Schemas
```typescript
// Tool Inputs
CreateTaskInput: { prompt, repoUrl, selectedAgent, selectedModel, installDependencies, keepAlive }
GetTaskInput: { taskId }
ContinueTaskInput: { taskId, message }
ListTasksInput: { limit, status? }
StopTaskInput: { taskId }
```

## Local Patterns
- **Schema Validation**: Zod for all inputs; descriptive error messages
- **Tool Naming**: Match MCP convention (kebab-case: create-task, get-task)
- **Timestamp Format**: ISO 8601 for all dates
- **Response Format**: Return full task object + essential fields for MCP clients
- **Error Handling**: Return error messages; don't expose internal stack traces

## Integration Points
- **app/api/mcp/route.ts**: Main HTTP handler; dispatches to tool handlers
- **lib/mcp/tools/**: Individual tool implementations (create-task.ts, etc.)
- **lib/auth/api-token.ts**: `getAuthFromRequest()` for Bearer token validation
- **app/api/tasks/route.ts**: Reuse existing task CRUD logic
- **lib/utils/rate-limit.ts**: Check daily message limits

## Files in This Module
- `schemas.ts` - Zod validation schemas for all 5 tools (80 lines)
- `types.ts` - TypeScript types (MCP-specific)
- `tools/index.ts` - Export all tool handlers
- `tools/create-task.ts` - Create new coding task
- `tools/get-task.ts` - Retrieve task by ID
- `tools/continue-task.ts` - Send follow-up message
- `tools/list-tasks.ts` - List user's tasks with optional filters
- `tools/stop-task.ts` - Stop running task

## MCP Authentication Methods
Both methods require API token from Settings page:

**Query Parameter** (recommended for Claude Desktop):
```
GET /api/mcp?apikey=YOUR_API_TOKEN
POST /api/mcp?apikey=YOUR_API_TOKEN
```

**Authorization Header**:
```
Authorization: Bearer YOUR_API_TOKEN
```

## Common Workflows
1. **Create Task**: Validate schema → Check rate limit → Check auth → Execute → Return taskId
2. **Get Task**: Validate taskId → Fetch from DB → Verify userId match → Return task
3. **Continue Task**: Validate taskId → Check auth → Insert message → Trigger agent → Return confirmation
4. **List Tasks**: Fetch user's tasks → Filter by status if provided → Sort by createdAt desc → Return array
5. **Stop Task**: Fetch task → Verify userId → Update status to 'stopped' → Kill sandbox → Return confirmation

## Security Notes
- **Token-Only Auth**: MCP clients authenticate via API token (no session cookies)
- **User Isolation**: All queries filtered by token's userId; prevent cross-user access
- **URL Exposure**: API tokens visible in URL query parameter → Always use HTTPS
- **Token Rotation**: Recommend rotating tokens regularly from Settings page
- **Readonly on Error**: Failed requests return error message without exposing system details

## Rate Limiting
- **Standard**: 20 tasks + follow-ups per day (from .env MAX_MESSAGES_PER_DAY)
- **Admin**: 100 per day (users in NEXT_PUBLIC_ADMIN_EMAIL_DOMAINS)
- **Per-User Settings**: Can override via settings table

## Gotchas & Edge Cases
- **Token Format**: Raw token passed in URL/header; hashed for lookup in apiTokens table
- **Expiry Checks**: Expired tokens rejected before user lookup (fail fast)
- **Empty List**: Return empty array if user has no tasks; don't return error
- **Status Enum**: Only 'pending', 'processing', 'completed', 'error', 'stopped'
- **MCP Message Structure**: Follow MCP protocol for successful/error responses
