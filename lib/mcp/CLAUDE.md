# MCP Module

## Domain Purpose
Model Context Protocol server over HTTP: 5 tools (create-task, get-task, continue-task, list-tasks, stop-task) with token authentication, Zod validation, and rate limiting.

## Module Boundaries
- **Owns**: MCP protocol handling, tool schemas, request dispatch, tool implementations
- **Delegates to**: `lib/auth/api-token.ts` for token auth, `lib/db/` for CRUD, `lib/utils/rate-limit.ts` for limits

## Local Patterns
- **Tool Naming**: kebab-case (create-task, get-task, etc.) per MCP convention
- **Schema Validation**: Zod for all inputs; descriptive error messages
- **Timestamp Format**: ISO 8601 for all dates
- **Error Handling**: Return error messages; never expose stack traces
- **Authentication**: Dual-auth methods: query param `?apikey=TOKEN` or `Authorization: Bearer TOKEN`
- **User Scoping**: All queries filter by token's userId; prevent cross-user access
- **Rate Limiting**: Standard 20/day, Admin 100/day (same as web UI)

## Integration Points
- `app/api/mcp/route.ts` - Main HTTP handler
- `lib/auth/api-token.ts` - `getAuthFromRequest()` for Bearer token validation
- `lib/db/` - Task CRUD operations
- `lib/utils/rate-limit.ts` - Check daily message limits

## Key Files
- `schemas.ts` - Zod validation schemas for all 5 tools
- `tools/create-task.ts`, `get-task.ts`, `continue-task.ts`, `list-tasks.ts`, `stop-task.ts` - Tool implementations
