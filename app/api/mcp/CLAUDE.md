# app/api/mcp

MCP protocol HTTP handler exposing 5 task management tools to Claude Desktop, Cursor, Windsurf.

## Domain Purpose
- HTTP-based MCP endpoint for external clients to manage coding tasks
- Bearer token auth via query param (`?apikey=XXX`) or Authorization header
- Response format: MCP-compliant JSON (no SSE)

## Local Patterns
- **Auth middleware**: `experimental_withMcpAuth` handles token extraction and user verification
- **Tool registration**: Zod schemas validate input; handlers return `{ result: { data } }` or `{ error: { message } }`
- **Rate limit**: Same as web UI (20/day users, 100/day admins)

## Tools Registered
1. `create-task` - Prompt, repoUrl, agent, model, installDependencies, keepAlive → taskId (requires GitHub connection)
2. `get-task` - taskId → full task object
3. `continue-task` - taskId, message → confirmation
4. `list-tasks` - limit, status filter → task array
5. `stop-task` - taskId → confirmation

## Integration Points
- **Auth**: `getAuthFromRequest()` validates Bearer token → user
- **Database**: `tasks`, `taskMessages` tables
- **Crypto**: Token decryption from API tokens table
- **Rate Limit**: `checkRateLimit()` enforcement
- **MCP Library**: `mcp-handler` npm package

## Key Files
- `route.ts` - Handler with `experimental_withMcpAuth` wrapper
- Tool handlers: `@/lib/mcp/tools/`
- Schemas: `@/lib/mcp/schemas.ts`

## Configuration & Key Behaviors
- Claude Desktop: `~/.config/Claude/claude.json` → mcpServers → url with ?apikey=
- HTTPS required (token in query param)
- **GitHub requirement**: `create-task` requires GitHub connection (verified before task creation)
- Error codes: 401 (auth), 429 (rate limit), 400 (invalid input), 404 (not found)
