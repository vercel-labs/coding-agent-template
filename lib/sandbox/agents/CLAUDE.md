# Agents Module

## Domain Purpose
Execute AI agent CLIs (Claude, Codex, Copilot, Cursor, Gemini, OpenCode) with consistent authentication, streaming, and session management.

## Module Boundaries
- **Owns**: Agent dispatch, CLI installation, authentication setup, output parsing, streaming message accumulation
- **Delegates to**: `lib/sandbox/commands.ts` for execution, `lib/utils/task-logger.ts` for logging, `lib/utils/logging.ts` for redaction

## Local Patterns
- **Agent Interface**: All agents follow: Install → Authenticate → Execute → Check git changes
- **Streaming Output**: Newline-delimited JSON events; accumulate in `taskMessages` in real-time
- **Session Resumption** (Claude): `--resume "<sessionId>"` if valid UUID; fallback to `--continue`
- **Error Response**: `{ success: false, error, cliName, changesDetected: false }`
- **Success Response**: `{ success: true, cliName, changesDetected, sessionId? }`
- **Timeout**: 5-minute max wait; force completion if output detected
- **MCP Config** (Claude only): Load connectors, serialize stdio (local) + http (remote), write `.mcp.json`

## Integration Points
- `lib/sandbox/creation.ts` - Called via `executeAgentInSandbox()` after sandbox ready
- `app/api/tasks/route.ts` - Passes selectedAgent, selectedModel, apiKeys, mcpServers
- `lib/utils/task-logger.ts` - Real-time logging to task.logs
- `lib/db/schema.ts` - taskMessages table for streaming responses

## Key Files
- `index.ts` - `executeAgentInSandbox()` dispatcher; env var setup/restore
- `claude.ts` - Claude CLI; dual auth (AI Gateway → Anthropic); streaming; MCP support
- `codex.ts`, `copilot.ts`, `cursor.ts`, `gemini.ts`, `opencode.ts` - Agent-specific implementations
