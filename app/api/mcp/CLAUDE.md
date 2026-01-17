# app/api/mcp - Model Context Protocol HTTP Handler

HTTP-based MCP server exposing task management tools via MCP protocol. Enables Claude Desktop, Cursor, Windsurf, and other MCP clients to programmatically create/manage coding tasks.

## Domain Purpose
Provide MCP-compatible HTTP interface for remote clients to interact with the platform: create tasks, retrieve status, send follow-ups, list tasks, stop execution. Handles Bearer token auth and tool registration.

## Route

- **`GET|POST|DELETE /api/mcp`**
- Protocol: MCP over HTTP (Streamable HTTP, no SSE)
- Auth: Bearer token via query param (`?apikey=xxx`) or Authorization header
- Content-Type: application/json

## MCP Tools Exposed

### 1. create-task
Create a new coding task with AI agent.

**Input:**
```typescript
{
  prompt: string              // Task description
  repoUrl: string            // GitHub repo URL
  selectedAgent: string      // 'claude', 'codex', 'gemini', 'cursor', 'copilot', 'opencode'
  selectedModel?: string     // Model name (e.g., 'claude-opus-4-5-20251101')
  installDependencies?: boolean  // Install npm/pnpm deps (default: false)
  keepAlive?: boolean        // Keep sandbox after completion (default: false)
}
```

**Output:**
```typescript
{
  taskId: string
  status: 'pending'
  createdAt: string
}
```

### 2. get-task
Retrieve task details including status, logs, progress, PR info.

**Input:**
```typescript
{ taskId: string }
```

**Output:** Full task object

### 3. continue-task
Send follow-up message to completed task (resumes in sandbox).

**Input:**
```typescript
{
  taskId: string
  message: string
}
```

**Output:** Confirmation message

### 4. list-tasks
List user's tasks with optional status filter.

**Input:**
```typescript
{
  limit?: number           // Max 100
  status?: 'pending' | 'processing' | 'completed' | 'error' | 'stopped'
}
```

**Output:** Array of task objects

### 5. stop-task
Terminate running task and shutdown sandbox.

**Input:**
```typescript
{ taskId: string }
```

**Output:** Confirmation message

## Key Patterns

### Authentication
```typescript
// Query parameter (automatic transformation to Authorization header)
GET /api/mcp?apikey=YOUR_TOKEN

// Authorization header
GET /api/mcp
Authorization: Bearer YOUR_TOKEN

// Both handled by: experimental_withMcpAuth middleware
```

### Handler Implementation
```typescript
const handler = experimental_withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    const user = await getAuthFromRequest(request as NextRequest)
    if (!user) return undefined  // Deny access
    return { token: bearerToken, clientId: user.id }
  },
  { required: true }
)
```

### Tool Registration
```typescript
server.registerTool('tool-name', {
  title: 'Display Title',
  description: 'What it does',
  inputSchema: zodSchema,
}, async (input, extra) => {
  // Handler implementation
  return result
})
```

## Response Format

### Success
```typescript
{ result: { data: {...} } }
```

### Error
```typescript
{ error: { message: 'Error description' } }
```

## Configuration Example

### Claude Desktop (`~/.config/Claude/claude.json`)
```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_API_TOKEN"
    }
  }
}
```

### Cursor Integration
Uses MCP servers configured in Cursor settings > MCP Servers.

## Security Notes

- **Token exposure**: Query parameter auth shows token in URL - HTTPS required
- **Token format**: 64-character hex string (regenerable from Settings page)
- **Token hashing**: SHA256 hashed before DB storage, cannot be retrieved
- **Rate limiting**: Same limits as web UI (20/day for users, 100/day for admins)
- **User scoping**: All operations scoped to authenticated user only
- **CORS**: Handled by Next.js middleware

## Error Handling

- `401 Unauthorized` - Invalid/missing token
- `429 Too Many Requests` - Rate limit exceeded
- `400 Bad Request` - Invalid input parameters
- `404 Not Found` - Task not found or belongs to different user
- `500 Internal Server Error` - Server error (static message)

## Implementation Details

### Handler Setup
- Uses `mcp-handler` npm package
- Registers 5 tools with Zod input schemas
- Adapts MCP library's auth format to internal McpToolContext
- Non-SSE HTTP transport for simplicity

### Tool Handler Location
- Core handlers: `@/lib/mcp/tools/`
- Schemas: `@/lib/mcp/schemas.ts`
- Type definitions: `@/lib/mcp/types.ts`

## Integration Points

- **Auth**: `getAuthFromRequest()` for dual Bearer/session auth
- **Database**: `tasks`, `taskMessages` tables
- **Task Processing**: Delegates to POST /api/tasks routes
- **Rate Limiting**: `checkRateLimit()` enforcement
- **MCP Library**: `mcp-handler` package (v1.0+)

## Testing
- Test with: `curl -H "Authorization: Bearer TOKEN" https://domain/api/mcp`
- MCP clients: Claude Desktop, Cursor, Windsurf, etc.
- Response format: MCP-compliant JSON

## Documentation References
- Full MCP server docs: `docs/MCP_SERVER.md`
- MCP spec: https://modelcontextprotocol.io/
- API token generation: User Settings page
