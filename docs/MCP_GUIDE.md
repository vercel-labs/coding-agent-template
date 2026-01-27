# MCP Guide: Using AA Coding Agent from Claude, Cursor & Windsurf

Welcome! This guide helps you use the AA Coding Agent's Model Context Protocol (MCP) server to create and manage coding tasks directly from your favorite editor or AI assistant.

## What is MCP?

MCP (Model Context Protocol) is a standard that lets AI assistants like Claude, Cursor, and Windsurf talk to external tools. Think of it as a bridge between your editor and the AA Coding Agent platform. Instead of switching to the web UI, you can ask Claude to create a task, and it automatically manages the workflow for you.

**The AA Coding Agent MCP server gives Claude access to:**
- Create coding tasks in your repositories
- Check task status and get progress updates
- Send follow-up messages to continue tasks
- List and stop running tasks

## Getting Started (5 minutes)

### Step 1: Generate an API Token

1. Sign in to the AA Coding Agent web app
2. Go to **Settings** → **API Tokens**
3. Click **"Generate Token"**
4. Copy the token (shown only once!) and save it somewhere safe

### Step 2: Connect Your GitHub Account

1. In the web app, go to **Settings** → **Accounts**
2. Click **"Connect GitHub"** and authorize the app
3. You're ready! The token will automatically use your GitHub access

### Step 3: Configure Your Tool

Choose your editor and follow the setup:

**Claude Desktop** (macOS, Windows, or Linux)
1. Open the appropriate configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`
2. Add this configuration (replace `your-domain.com` with your actual deployment URL):
```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_TOKEN"
    }
  }
}
```
3. Restart Claude Desktop
4. Look for the tools icon (hammer) in Claude—you should see "aa-coding-agent" listed

**Cursor**
1. Open the appropriate configuration file:
   - **macOS/Linux**: `~/.cursor/mcp_config.json`
   - **Windows**: `%USERPROFILE%\.cursor\mcp_config.json`
2. Add:
```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_TOKEN",
      "transport": "http"
    }
  }
}
```
3. Restart Cursor

**Windsurf**
1. Open the appropriate configuration file:
   - **macOS**: `~/Library/Application Support/Windsurf/mcp_config.json`
   - **Windows**: `%APPDATA%\Windsurf\mcp_config.json`
   - **Linux**: `~/.config/Windsurf/mcp_config.json`
2. Add this configuration (replace `your-domain.com` with your actual deployment URL):
```json
{
  "mcpServers": {
    "aa-coding-agent": {
      "url": "https://your-domain.com/api/mcp?apikey=YOUR_TOKEN"
    }
  }
}
```
3. Restart Windsurf

## Available Tools at a Glance

| Tool | Use When | Example |
|------|----------|---------|
| **create-task** | You want Claude to write code in a repo | "Create unit tests for the auth module in my repo starting from develop branch" |
| **get-task** | You want to check a task's status or see logs | "What's the status of task ABC123?" |
| **continue-task** | You want to give the agent more instructions (requires keepAlive) | "Also add integration tests for the login flow" |
| **list-tasks** | You want to see your recent tasks | "Show me my completed tasks from today" |
| **stop-task** | You want to stop a running task | "Stop task ABC123" |

## How to Prompt Claude Effectively

Claude learns what tools to use from your natural language requests. Here are examples:

**Create a New Task:**
> "Use the AA Coding Agent to add unit tests for the authentication module in https://github.com/myorg/myrepo. Use Claude Sonnet model and install dependencies."

**Create Task from Specific Branch:**
> "Create a task in https://github.com/myorg/myrepo starting from the develop branch. Add integration tests for the new payment API."

**Check Progress:**
> "Get the task with ID abc123def456 and tell me how far along it is"

**Iterate on Work:**
> "Continue task abc123def456 with this: Also refactor the error handling to use custom exceptions instead of generic errors"

**List Your Work:**
> "List my completed tasks from AA Coding Agent"

Claude will recognize these patterns and call the right tool. You don't need to specify tool names—just describe what you want!

## Advanced Options

When creating tasks, you can customize:

- **sourceBranch** - Start from a specific branch instead of the repository's default branch
  - Example: "Create task from the develop branch"
- **keepAlive** - Keep sandbox running after completion to send follow-up messages via `continue-task`
  - Without keepAlive: Sandbox terminates immediately, task cannot be continued
  - With keepAlive: Sandbox stays alive until timeout or manual stop
- **installDependencies** - Automatically run `npm install` or equivalent before agent execution
- **selectedModel** - Choose specific AI model (e.g., claude-sonnet-4-5-20250929, gpt-5.2-codex)

For complete parameter details and available models, see [MCP_SERVER.md](./MCP_SERVER.md#available-tools).

## Common Workflows

### Workflow 1: Quick Fix (5 min)
1. Ask Claude: "Create a task to fix the typo in the README at https://github.com/myorg/myrepo"
2. Claude runs the task and shows you the task ID
3. Ask: "What's the status of that task?" to check progress
4. Claude shows logs and PR details when ready

### Workflow 2: Multi-Step Feature (20 min)
1. Ask: "Create a task to add a login form component in https://github.com/myorg/myrepo. Keep the sandbox alive."
2. Claude creates the component and the sandbox remains running
3. Ask: "Continue the task to also add validation and error handling"
4. Claude adds the improvements in the same branch
5. Ask: "Stop the task when ready" (or let it auto-terminate after timeout)

### Workflow 3: Batch Operations
1. Ask: "List my failed tasks from last week"
2. Review the failures
3. Ask: "Create a new task to fix the issues in https://github.com/myorg/myrepo based on what we learned"

## Best Practices

**DO:**
- ✅ Generate a new token for production use (rotate quarterly)
- ✅ Use long prompts for complex tasks (Claude handles 5000-char prompts)
- ✅ Enable "keepAlive" if you plan to iterate with follow-ups (sandbox stays alive for continue-task, otherwise terminates immediately)
- ✅ Use `get-task` regularly to monitor progress
- ✅ Reference task IDs when continuing work
- ✅ Specify `sourceBranch` when starting from a feature branch (defaults to repo's default branch)

**DON'T:**
- ❌ Commit your API token to version control—use environment variables
- ❌ Share tokens publicly or include them in logs
- ❌ Assume a task is done without checking status first
- ❌ Create too many tasks at once (you have a daily limit)
- ❌ Try to continue a task without keepAlive enabled (sandbox will be terminated)

## Rate Limits & Quotas

- **Default users**: 20 tasks per day
- **Admin users**: 100 tasks per day
- Limits reset at midnight UTC
- Each task creation and follow-up counts as one request

## Troubleshooting

**"GitHub not connected" error**
→ Go to the web app Settings → Accounts → Connect GitHub, then generate a fresh token

**"Authentication required" error**
→ Check your token is correct and hasn't expired. Generate a new one if needed.

**Tools don't appear in Claude/Cursor/Windsurf**
→ Verify the configuration file path is correct, check JSON syntax, and restart the app

**Rate limit hit**
→ Wait until midnight UTC or request admin status for higher limits

## Next Steps

For detailed technical information, see **[MCP_SERVER.md](./MCP_SERVER.md)**:
- Complete API schemas and parameters (including `sourceBranch`, `selectedModel`, `keepAlive`)
- Error response formats and HTTP status codes
- Token security and rotation best practices
- Advanced client configurations
- Full troubleshooting guide

Ready to start? Generate a token and configure your editor!
