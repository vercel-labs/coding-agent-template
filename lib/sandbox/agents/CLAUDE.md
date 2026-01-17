# Agents Module

## Domain Purpose
Execute different AI agent CLIs (Claude, Codex, Copilot, Cursor, Gemini, OpenCode) in sandboxes with consistent logging, error handling, and session management.

## Key Responsibilities
- **Agent Dispatch**: Route to correct agent handler (claude.ts, codex.ts, etc.) based on selected agent type
- **Authentication Setup**: Install CLI, configure API keys, authenticate with appropriate provider
- **MCP Server Integration**: Build and write `.mcp.json` config file for Claude servers
- **Session Management**: Handle --resume/--continue for follow-up messages in kept-alive sandboxes
- **Streaming Output**: Capture and parse streaming JSON output; accumulate content in real-time
- **Model Selection**: Apply selected model to agent command; validate format
- **Logging & Redaction**: Log all operations with static strings; redact sensitive data from output

## Module Boundaries
- **Delegates to**: `lib/sandbox/commands.ts` for sandbox command execution
- **Delegates to**: `lib/utils/task-logger.ts` for structured logging
- **Delegates to**: `lib/utils/logging.ts` for sensitive data redaction
- **Delegates to**: `lib/db/schema.ts`, `lib/db/client.ts` for streaming message updates
- **Owned**: Agent-specific execution logic, CLI authentication, output parsing

## Agent-Specific Patterns
All agents (claude.ts, codex.ts, copilot.ts, cursor.ts, gemini.ts, opencode.ts) follow:
1. **Installation Check**: `which <agent>` → skip if found
2. **Install if Missing**: `npm install -g <package>`
3. **Authenticate**: API key/config file/environment setup
4. **Execute**: Run CLI with instruction → capture output
5. **Git Changes Check**: `git status --porcelain` → detect modifications

## Claude Agent (claude.ts) - CRITICAL PATTERNS
- **Dual Auth Strategy**:
  - **AI Gateway Priority**: Use if `AI_GATEWAY_API_KEY` set (supports Gemini, GPT models)
  - **Anthropic Direct**: Fall back to `ANTHROPIC_API_KEY` (Claude models only)
  - **Config File**: Write to `~/.config/claude/config.json` for Anthropic auth
  - **Env Vars**: Set `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` for AI Gateway

- **MCP Server Discovery**:
  - Claude Code auto-discovers servers from `project/.mcp.json`
  - Supports both local (stdio) and remote (HTTP) servers
  - Env vars and OAuth credentials embedded in config

- **Streaming Output**:
  - Flag: `--output-format stream-json` + `--verbose`
  - Output: Newline-delimited JSON events (assistant, tool_use, result chunks)
  - Accumulate content in `taskMessages` table in real-time
  - Extract session_id from result chunk for resumption

- **Session Resumption**:
  - Flag: `--resume "<sessionId>"` if valid UUID format
  - Flag: `--continue` for most recent session in directory
  - Required for multi-turn conversations in kept-alive sandboxes

## API Key Priority (All Agents)
```
User Provided (apiKeys param) → Temp set process.env
                              ↓
              Check process.env (global fallback)
                              ↓
                      Validate required keys
                              ↓
                      Return error if missing
```

## Logging Rules (CRITICAL)
- **NO dynamic values**: Never log taskId, userId, file paths, repo URLs, API key details
- **Bad**: `await logger.info('Task created: ${taskId}')`
- **Good**: `await logger.info('Task created')`
- **Commands**: Use `redactSensitiveInfo()` on all shell commands before logging
- **Errors**: Log error messages, not error stack traces with sensitive data

## Local Patterns
- **Error Handling**: Return `{ success: false, error: message, cliName, changesDetected: false }`
- **Success Response**: `{ success: true, cliName, changesDetected: boolean, sessionId? }`
- **Streaming Messages**: Update DB in background (no await); don't break if DB write fails
- **Model Defaults**: claude-sonnet-4-5-20250929, gpt-5.2, etc. (agent-specific)

## Integration Points
- **lib/sandbox/creation.ts**: Called via `executeAgentInSandbox()` after sandbox setup
- **app/api/tasks/route.ts**: Passes selectedAgent, selectedModel, apiKeys, mcpServers
- **lib/sandbox/sandbox-registry.ts**: Agents run within registered sandbox context
- **lib/utils/task-logger.ts**: Real-time logging to task.logs (JSONB)
- **lib/db/schema.ts**: taskMessages table for streaming Claude responses

## Common Workflows
1. **First Run**: Install CLI → Authenticate → Execute → Check git changes
2. **Resumed Execution**: Skip install → Re-authenticate → Execute with --resume → Check changes
3. **MCP Server Setup** (Claude only):
   - Load connectors from database
   - Build .mcp.json with local (stdio) + remote (HTTP) servers
   - Write to project directory; Claude discovers at startup

## Files in This Module
- `index.ts` - `executeAgentInSandbox()` dispatcher; env var setup/restore
- `claude.ts` - Claude CLI execution; dual auth; streaming; MCP support
- `codex.ts` - OpenAI Codex CLI execution
- `copilot.ts` - GitHub Copilot CLI execution
- `cursor.ts` - Cursor IDE CLI execution; session ID handling
- `gemini.ts` - Google Gemini CLI execution
- `opencode.ts` - OpenCode multi-model CLI execution

## Gotchas & Edge Cases
- **Session IDs**: Must be valid UUID format; fallback to --continue if invalid
- **Streaming Timeout**: 5-minute max wait; force completion if output detected
- **MCP Config**: Only for Claude agent; serializes as stdio (local) or http (remote)
- **API Key Validation**: Codex requires specific key format (sk- or vck-); checks happen early
- **Output Parsing**: JSON parse errors are silently caught; non-JSON lines ignored
- **Tool Use Tracking**: Extract path from multiple possible field names (path, file_path, filepath)
