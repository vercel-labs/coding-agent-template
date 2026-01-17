# MCP Server Documentation

The AA Coding Agent platform exposes a Model Context Protocol (MCP) server that allows external MCP clients to programmatically create and manage coding tasks. This enables integration with tools like Claude Desktop, Cursor, Windsurf, and other MCP-compatible applications.

## Table of Contents

- [Introduction](#introduction)
- [Authentication Setup](#authentication-setup)
- [Available Tools](#available-tools)
- [Client Configuration](#client-configuration)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Introduction

The MCP server provides programmatic access to the AA Coding Agent platform via the Model Context Protocol. It exposes five core tools for task management:

- **create-task** - Create new coding tasks
- **get-task** - Retrieve task details and status
- **continue-task** - Send follow-up messages to tasks
- **list-tasks** - List your tasks with optional filters
- **stop-task** - Stop running tasks

### Endpoint Information

- **Base URL**: `https://your-domain.com/api/mcp`
- **Protocol**: MCP over HTTP (Streamable HTTP transport)
- **Methods**: GET, POST, DELETE
- **Content Type**: `application/json`
- **Authentication**: Required (API token)
- **Implementation**: Uses `mcp-handler` library v1.0.7 with experimental auth middleware

**Note:** The MCP server uses experimental authentication features that may evolve. Ensure your MCP clients are compatible with HTTP-based MCP transport.

## Authentication Setup

### Prerequisites

**GitHub Connection Required**: To use the MCP server for repository operations, you must first connect your GitHub account via the web UI:

1. Sign in to the AA Coding Agent web application
2. Navigate to **Settings** (`/settings`)
3. Go to **Accounts** and connect your GitHub account
4. Authorize the application to access your repositories

Your API token will automatically inherit your GitHub OAuth credentials, enabling full repository access via MCP.

### Step 1: Generate an API Token

1. Sign in to the AA Coding Agent web application
2. Navigate to **Settings** (`/settings`)
3. Click **"Generate API Token"**
4. Copy the token immediately (it's shown only once)
5. Optionally set an expiration date for the token

The token is a 64-character hexadecimal string that looks like:
```
a1b2c3d4e5f6...
```

**Important**: The raw token cannot be retrieved after creation. If you lose it, you must generate a new one.

### Step 2: Authentication Methods

The MCP server supports two authentication methods:

#### Method 1: Query Parameter (Recommended)

Add your API token as a query parameter to the MCP server URL:

```
https://your-domain.com/api/mcp?apikey=YOUR_API_TOKEN
```

This method is recommended for Claude Desktop and other clients that don't support custom headers.

#### Method 2: Authorization Header

Include the token in the `Authorization` header:

```
Authorization: Bearer YOUR_API_TOKEN
```

This method is more secure but requires client support for custom headers.

## Available Tools

### 1. create-task

Create and immediately execute a new coding task with an AI agent.

**Requirements:**
- GitHub account must be connected (see Prerequisites above)
- API token inherits your GitHub OAuth credentials for full repository access
- Task execution starts automatically after creation

**How It Works:**
1. Verifies GitHub access is connected to your account
2. Validates repository URL accessibility
3. Creates task record with `processing` status
4. Immediately triggers sandbox provisioning and agent execution
5. Returns task ID for progress monitoring

**Input Schema:**

```json
{
  "prompt": "string (required, 1-5000 chars)",
  "repoUrl": "string (required, valid GitHub URL)",
  "selectedAgent": "string (optional, default: claude)",
  "selectedModel": "string (optional)",
  "installDependencies": "boolean (optional, default: false)",
  "keepAlive": "boolean (optional, default: false)"
}
```

**Available Agents:**
- `claude` - Claude Code
- `codex` - OpenAI Codex CLI
- `copilot` - GitHub Copilot CLI
- `cursor` - Cursor CLI
- `gemini` - Google Gemini CLI
- `opencode` - OpenCode

**Example Input:**

```json
{
  "prompt": "Add unit tests for the authentication module",
  "repoUrl": "https://github.com/owner/repo",
  "selectedAgent": "claude",
  "selectedModel": "claude-sonnet-4-5-20250929",
  "installDependencies": true,
  "keepAlive": false
}
```

**Response:**

```json
{
  "success": true,
  "taskId": "abc123def456",
  "status": "processing",
  "message": "Task created and execution started. Use get-task to check progress.",
  "createdAt": "2026-01-17T10:30:00Z"
}
```

### 2. get-task

Retrieve detailed information about a specific task.

**Input Schema:**

```json
{
  "taskId": "string (required)"
}
```

**Example Input:**

```json
{
  "taskId": "abc123def456"
}
```

**Response:**

```json
{
  "id": "abc123def456",
  "status": "completed",
  "progress": 100,
  "prompt": "Add unit tests for the authentication module",
  "title": "Add unit tests",
  "repoUrl": "https://github.com/owner/repo",
  "branchName": "feature/add-auth-tests-A1b2C3",
  "selectedAgent": "claude",
  "selectedModel": "claude-sonnet-4-5-20250929",
  "sandboxUrl": "https://sandbox.vercel.app/...",
  "prUrl": "https://github.com/owner/repo/pull/123",
  "prNumber": 123,
  "prStatus": "open",
  "logs": [
    {
      "type": "info",
      "message": "Task started",
      "timestamp": "2026-01-17T10:30:00Z"
    }
  ],
  "error": null,
  "createdAt": "2026-01-17T10:30:00Z",
  "updatedAt": "2026-01-17T10:35:00Z",
  "completedAt": "2026-01-17T10:35:00Z"
}
```

**Task Status Values:**
- `pending` - Task created, waiting to start
- `processing` - Task is currently running
- `completed` - Task finished successfully
- `error` - Task failed with an error
- `stopped` - Task was manually stopped

### 3. continue-task

Send a follow-up message to continue a task with additional instructions.

**Requirements:**
- Task must have completed its initial execution
- Task must have a branch created
- Sandbox must still be alive (if keepAlive was enabled)

**Behavior:**
- The message is saved immediately and the task status is reset to `processing`
- The actual task continuation execution happens asynchronously in the background
- Use `get-task` to monitor the task status and logs

**Input Schema:**

```json
{
  "taskId": "string (required)",
  "message": "string (required, 1-5000 chars)"
}
```

**Example Input:**

```json
{
  "taskId": "abc123def456",
  "message": "Also add integration tests for the login flow"
}
```

**Response:**

```json
{
  "success": true,
  "taskId": "abc123def456",
  "message": "Task continuation started"
}
```

### 4. list-tasks

List all tasks for the authenticated user with optional filters.

**Input Schema:**

```json
{
  "limit": "number (optional, 1-100, default: 20)",
  "status": "string (optional, one of: pending, processing, completed, error, stopped)"
}
```

**Example Input:**

```json
{
  "limit": 10,
  "status": "completed"
}
```

**Response:**

```json
{
  "tasks": [
    {
      "id": "abc123def456",
      "title": "Add unit tests",
      "status": "completed",
      "progress": 100,
      "prompt": "Add unit tests for the authentication module...",
      "repoUrl": "https://github.com/owner/repo",
      "branchName": "feature/add-auth-tests-A1b2C3",
      "selectedAgent": "claude",
      "prUrl": "https://github.com/owner/repo/pull/123",
      "prStatus": "open",
      "createdAt": "2026-01-17T10:30:00Z",
      "updatedAt": "2026-01-17T10:35:00Z",
      "completedAt": "2026-01-17T10:35:00Z"
    }
  ],
  "count": 1
}
```

**Note:** Prompts in the list response are truncated to 200 characters. Use `get-task` to retrieve the full prompt text.

### 5. stop-task

Stop a running task and terminate its sandbox.

**Requirements:**
- Task must be in `processing` status

**Input Schema:**

```json
{
  "taskId": "string (required)"
}
```

**Example Input:**

```json
{
  "taskId": "abc123def456"
}
```

**Response:**

```json
{
  "success": true,
  "taskId": "abc123def456",
  "status": "stopped",
  "message": "Task stopped successfully"
}
```

## Client Configuration

### Claude Desktop

Claude Desktop is a popular MCP client that can connect to the AA Coding Agent MCP server.

**Configuration File Location:**

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_API_TOKEN"
    }
  }
}
```

**Using the Tools in Claude Desktop:**

Once configured, you can use the tools naturally in conversation:

```
Create a coding task to add unit tests for my auth module in
https://github.com/myorg/myrepo using Claude Sonnet
```

Claude Desktop will automatically call the `create-task` tool with the appropriate parameters.

### Cursor

Cursor supports MCP servers through its configuration system.

**Configuration File Location:**

- **macOS/Linux**: `~/.cursor/mcp_config.json`
- **Windows**: `%USERPROFILE%\.cursor\mcp_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_API_TOKEN",
      "transport": "http"
    }
  }
}
```

### Windsurf

Windsurf also supports MCP servers with similar configuration.

**Configuration File Location:**

- **macOS**: `~/Library/Application Support/Windsurf/mcp_config.json`
- **Windows**: `%APPDATA%\Windsurf\mcp_config.json`
- **Linux**: `~/.config/Windsurf/mcp_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_API_TOKEN"
    }
  }
}
```

### Generic MCP Clients

For other MCP clients that support HTTP transport:

```json
{
  "servers": {
    "aa-coding-agent": {
      "type": "http",
      "url": "https://your-domain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}
```

## Error Handling

### Error Response Format

All errors return an MCP response with `isError: true`:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error message"
    }
  ],
  "isError": true
}
```

### Common Errors

**Authentication Required**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Authentication required"
    }
  ],
  "isError": true
}
```

**GitHub Not Connected**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\":\"GitHub not connected\",\"message\":\"GitHub access is required for repository operations.\",\"hint\":\"Visit /settings in the web UI to connect your GitHub account.\"}"
    }
  ],
  "isError": true
}
```

**Rate Limit Exceeded**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\":\"Rate limit exceeded\",\"message\":\"You have reached your daily message limit\",\"remaining\":0,\"total\":20,\"resetAt\":\"2026-01-18T00:00:00Z\"}"
    }
  ],
  "isError": true
}
```

**Task Not Found**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Task not found"
    }
  ],
  "isError": true
}
```

**User Not Found**
```json
{
  "content": [
    {
      "type": "text",
      "text": "User not found"
    }
  ],
  "isError": true
}
```

### HTTP Status Codes

- `200 OK` - Successful request
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Rate Limiting

The MCP server enforces the same rate limits as the web UI:

- **Default**: 20 tasks + follow-up messages per user per day
- **Admin domains**: 100 tasks + follow-up messages per day
- **Reset**: Limits reset at midnight UTC

Rate limit information is included in error responses:

```json
{
  "error": "Rate limit exceeded",
  "message": "You have reached your daily message limit",
  "remaining": 0,
  "total": 20,
  "resetAt": "2026-01-18T00:00:00Z"
}
```

### Rate Limit Best Practices

1. **Monitor your usage** - Check `remaining` count in rate limit responses
2. **Plan ahead** - Batch operations when possible
3. **Handle errors gracefully** - Implement exponential backoff on rate limit errors
4. **Request limit increase** - Contact admin if you need higher limits

## Security Considerations

### Token Security

- **Never commit tokens to version control** - Add configuration files to `.gitignore`
- **Use environment variables** - Store tokens in environment variables, not hardcoded
- **Rotate tokens regularly** - Generate new tokens periodically and revoke old ones
- **Set expiration dates** - Use temporary tokens for short-term access
- **Revoke unused tokens** - Delete tokens you no longer need from Settings

### HTTPS Required

API tokens appear in URLs when using query parameter authentication. **Always use HTTPS** to prevent token interception:

**Secure** (recommended):
```
https://your-domain.com/api/mcp?apikey=YOUR_TOKEN
```

**Insecure** (never use):
```
http://your-domain.com/api/mcp?apikey=YOUR_TOKEN
```

### Token Storage

- Tokens are **hashed (SHA256)** before storage in the database
- Raw tokens **cannot be recovered** after creation
- Lost tokens require generating new ones
- Maximum **20 tokens per user**

### Access Control

- All tools enforce **user-scoped access control**
- Users can only access their own tasks
- Tasks are filtered by `userId` in all queries
- No cross-user access is possible

### Best Practices

1. **Use Authorization header** when possible (more secure than query params)
2. **Enable HTTPS** for all requests
3. **Set token expiration dates** for temporary access
4. **Monitor token usage** from Settings page
5. **Revoke compromised tokens** immediately
6. **Avoid logging tokens** in client applications
7. **Use separate tokens** for different applications/environments

## Troubleshooting

### Connection Issues

**Problem**: "Cannot connect to MCP server"

**Solutions**:
1. Verify the server URL is correct
2. Check that HTTPS is being used
3. Ensure the API token is valid and not expired
4. Test the endpoint with curl:

```bash
curl -X POST "https://your-domain.com/api/mcp?apikey=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list"}'
```

### Authentication Failures

**Problem**: "Authentication required" error

**Solutions**:
1. Verify your API token is included in the URL or header
2. Check that the token hasn't been revoked
3. Ensure the token hasn't expired
4. Generate a new token and update your configuration

### Tool Execution Errors

**Problem**: Tools return errors or unexpected results

**Solutions**:
1. Check the tool input schema matches the documentation
2. Verify you have the required permissions (e.g., GitHub access for repositories)
3. Ensure you haven't exceeded rate limits
4. Review task logs in the web UI for detailed error messages

### Rate Limit Issues

**Problem**: "Rate limit exceeded" errors

**Solutions**:
1. Wait until midnight UTC for limits to reset
2. Request admin status if you need higher limits
3. Optimize your usage to batch operations
4. Use the `list-tasks` tool to check existing tasks before creating new ones

### Claude Desktop Issues

**Problem**: Tools don't appear in Claude Desktop

**Solutions**:
1. Verify the configuration file is in the correct location
2. Check JSON syntax is valid (use a JSON validator)
3. Restart Claude Desktop after configuration changes
4. Check Claude Desktop logs for connection errors

### Cursor/Windsurf Issues

**Problem**: MCP server not recognized

**Solutions**:
1. Verify the configuration file location is correct for your OS
2. Check that the `transport` is set to `"http"`
3. Restart the application after configuration changes
4. Ensure you're using a compatible version of the client

### Task Creation Failures

**Problem**: Tasks fail to create or start

**Solutions**:
1. **GitHub Not Connected** - If you receive a "GitHub not connected" error:
   - Sign in to the web application
   - Go to **Settings > Accounts**
   - Click "Connect GitHub" and authorize the application
   - Generate a new API token after connecting
   - Retry the MCP request
2. Verify the repository URL is valid and accessible from your GitHub account
3. Ensure the selected AI agent has required API keys configured
4. Check that the selected AI model has sufficient quota/credits
5. Review server logs for detailed error information
6. Try creating the task through the web UI to isolate the issue

**Note**: Tasks are executed immediately after creation with `processing` status. Use `get-task` to monitor progress. If a task fails to start, check that:
- GitHub access is active and not rate-limited
- The selected agent's API key is valid
- The sandbox environment is available

### Getting Help

If you encounter issues not covered in this guide:

1. **Check the web UI** - Log in and review task details/logs
2. **Review server logs** - Contact your administrator for server-side logs
3. **Generate diagnostics** - Use the `list-tasks` and `get-task` tools to gather information
4. **Contact support** - Provide your task ID and error messages for assistance

## Additional Resources

- [API Token Management](../README.md#external-api-access) - Web UI token management
- [Task Configuration](../README.md#task-configuration) - Understanding task options
- [AI Models and Keys](../AI_MODELS_AND_KEYS.md) - Configuring AI agent API keys
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/) - Official MCP documentation
