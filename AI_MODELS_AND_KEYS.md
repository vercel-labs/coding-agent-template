# AI Models and API Key System Documentation

This document provides comprehensive information about how the Agentic Assets coding agent platform manages AI models, API keys, and integrations with various AI providers.

## Table of Contents

1. [API Key System Architecture](#api-key-system-architecture)
2. [Supported Models by Agent](#supported-models-by-agent)
3. [API Key Management](#api-key-management)
4. [AI Gateway Integration](#ai-gateway-integration)
5. [Agent Implementations](#agent-implementations)
6. [Adding New Models](#adding-new-models)
7. [Adding New Providers](#adding-new-providers)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)

---

## API Key System Architecture

### Database Schema

The API key system is built on the `keys` table in the PostgreSQL database (`lib/db/schema.ts`):

```typescript
// From lib/db/schema.ts (lines 254-275)
export const keys = pgTable(
  'keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
    provider: text('provider', {
      enum: ['anthropic', 'openai', 'cursor', 'gemini', 'aigateway'],
    }).notNull(),
    value: text('value').notNull(), // Encrypted API key value
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: a user can only have one key per provider
    userIdProviderUnique: uniqueIndex('keys_user_id_provider_idx').on(table.userId, table.provider),
  }),
)
```

**Key Features:**
- **User-scoped**: Each key is tied to a specific user via `userId` foreign key
- **Provider-based**: Supports 5 providers: `anthropic`, `openai`, `cursor`, `gemini`, `aigateway`
- **Encrypted storage**: All key values are encrypted at rest using AES-256-GCM (see `lib/crypto.ts`)
- **Unique per provider**: A user can only have one key per provider (enforced by unique index)
- **Timestamped**: Tracks creation and last update times for audit trails

### Supported Providers

| Provider | Used By | Environment Variable Fallback | Purpose |
|----------|---------|-------------------------------|---------|
| `anthropic` | Claude agent | `ANTHROPIC_API_KEY` | Anthropic Claude models (claude-*) |
| `aigateway` | Claude agent, Codex agent, OpenCode agent | `AI_GATEWAY_API_KEY` | Vercel AI Gateway for alternative models and routing |
| `cursor` | Cursor agent | `CURSOR_API_KEY` | Cursor IDE agent |
| `gemini` | Gemini agent | `GEMINI_API_KEY` | Google Gemini models |
| `openai` | Codex, OpenCode agents | `OPENAI_API_KEY` | OpenAI GPT models (via AI Gateway) |

### User API Key Retrieval Flow

The system implements a **user-first, fallback-to-env** strategy:

```typescript
// From lib/api-keys/user-keys.ts (lines 9-61)
export async function getUserApiKey(provider: Provider): Promise<string | undefined> {
  const session = await getServerSession()

  // Default to system key
  const systemKeys = {
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    cursor: process.env.CURSOR_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    aigateway: process.env.AI_GATEWAY_API_KEY,
  }

  if (!session?.user?.id) {
    return systemKeys[provider]
  }

  try {
    const userKey = await db
      .select({ value: keys.value })
      .from(keys)
      .where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))
      .limit(1)

    if (userKey[0]?.value) {
      return decrypt(userKey[0].value)
    }
  } catch (error) {
    console.error('Error fetching user API key:', error)
  }

  return systemKeys[provider]
}
```

**Flow:**
1. Check if user is authenticated
2. If authenticated, query database for user's API key for the provider
3. If user key found, decrypt and return it
4. If no user key found, fall back to environment variable
5. If no user authenticated, use environment variable

### Encryption & Decryption

API keys are encrypted/decrypted using `lib/crypto.ts`:

```typescript
import { encrypt, decrypt } from '@/lib/crypto'

// Storing a key
const encryptedKey = encrypt(apiKey)
await db.insert(keys).values({
  id: nanoid(),
  userId: session.user.id,
  provider,
  value: encryptedKey,
})

// Retrieving a key
const decryptedValue = decrypt(key.value)
```

Uses **AES-256-GCM** encryption with keys derived from `ENCRYPTION_KEY` environment variable (32-byte hex string).

---

## Supported Models by Agent

### Claude Agent

**CLI Package**: `@anthropic-ai/claude-code`
**Installation**: Automatic (see `lib/sandbox/agents/claude.ts`)
**Default Model**: `claude-sonnet-4-5-20250929`

#### Authentication Methods

The Claude agent supports **two authentication methods** with automatic detection:

**1. Direct Anthropic API** (for Anthropic models):
- Required API Key: `anthropic` provider or `ANTHROPIC_API_KEY`
- Supported models: All `claude-*` models
- Configuration: `~/.config/claude/config.json` with `api_key` and `default_model`

**2. AI Gateway** (for alternative models):
- Required API Key: `aigateway` provider or `AI_GATEWAY_API_KEY`
- **Priority**: AI Gateway takes precedence if both keys are present
- Configuration via environment variables:
  ```
  ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"
  ANTHROPIC_AUTH_TOKEN=<AI_GATEWAY_API_KEY>
  ANTHROPIC_API_KEY=""
  ```
- Works seamlessly with MCP servers

#### Available Models (from `components/task-form.tsx`)

```typescript
const AGENT_MODELS = {
  claude: [
    // Standard Anthropic Models (use ANTHROPIC_API_KEY)
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-opus-4-5-20251101', label: 'Opus 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },

    // AI Gateway Alternative Models (use AI_GATEWAY_API_KEY)
    // Z.ai / Zhipu AI
    { value: 'glm-4.7', label: 'GLM-4.7 (Coding Flagship)' },

    // Google Gemini 3
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },

    // OpenAI GPT Models
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini' },
  ],
}
```

#### Model Selection Logic

```typescript
// From components/task-form.tsx
const getClaudeRequiredKeys = (model: string): Provider[] => {
  // Standard Anthropic models (claude-*)
  if (model.startsWith('claude-')) {
    return ['anthropic']
  }
  // All other models use AI Gateway
  return ['aigateway']
}
```

**MCP Server Support**: Claude is the only agent that supports MCP (Model Context Protocol) servers for extending capabilities. Works with both Anthropic API and AI Gateway authentication.

---

### Codex Agent

**CLI Package**: `@openai/codex` (placeholder - actual implementation uses AI Gateway)
**Installation**: Automatic
**Default Model**: `openai/gpt-5.1`
**Required API Key**: `aigateway` provider (Vercel AI Gateway)

#### Available Models

```typescript
const AGENT_MODELS = {
  codex: [
    { value: 'openai/gpt-5.2', label: 'GPT-5.2' },
    { value: 'openai/gpt-5.2-codex', label: 'GPT-5.2-Codex' },
    { value: 'openai/gpt-5.1-codex-mini', label: 'GPT-5.1-Codex mini' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
  ],
}
```

**Implementation** (`lib/sandbox/agents/codex.ts`, lines 29-85):
```typescript
export async function executeCodexInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
): Promise<AgentExecutionResult> {
  // Validates API_GATEWAY_API_KEY and model format
  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      success: false,
      error: 'AI Gateway API key not found. Please set AI_GATEWAY_API_KEY environment variable.',
      cliName: 'codex',
      changesDetected: false,
    }
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY
  const isOpenAIKey = apiKey?.startsWith('sk-')
  const isVercelKey = apiKey?.startsWith('vck_')
  // ...
}
```

**API Key Format Validation**:
- OpenAI format: `sk-*`
- Vercel AI Gateway format: `vck_*`

---

### Copilot Agent

**CLI Package**: `@github/copilot-cli`
**Installation**: Automatic
**Default Model**: `claude-sonnet-4.5`
**Required API Key**: GitHub token (automatic from OAuth connection)

#### Available Models

```typescript
const AGENT_MODELS = {
  copilot: [
    { value: 'claude-sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4', label: 'Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Haiku 4.5' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
}
```

**Special Handling** (`lib/sandbox/agents/index.ts`, lines 51-66):
```typescript
// For Copilot agent, get the GitHub token from the user's GitHub account
let githubToken: string | undefined
if (agentType === 'copilot') {
  const { getUserGitHubToken } = await import('@/lib/github/user-token')
  githubToken = (await getUserGitHubToken()) || undefined
}

// ... later ...
if (githubToken) {
  process.env.GH_TOKEN = githubToken
  process.env.GITHUB_TOKEN = githubToken
}
```

**No API Key Required**: Uses GitHub OAuth token from user's account connection automatically.

---

### Cursor Agent

**CLI Package**: Cursor installation script
**Installation**: Official installer from `https://cursor.com/install`
**Default Model**: `auto`
**Required API Key**: `cursor` provider

#### Available Models

```typescript
const AGENT_MODELS = {
  cursor: [
    { value: 'auto', label: 'Auto' },
    { value: 'composer-1', label: 'Composer' },
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'opus-4.5', label: 'Opus 4.5' },
    { value: 'opus-4.1', label: 'Opus 4.1' },
    { value: 'grok', label: 'Grok' },
  ],
}
```

**Model Flag Implementation** (`lib/sandbox/agents/cursor.ts`):
```typescript
const modelFlag = selectedModel ? ` --model ${selectedModel}` : ''
const logCommand = `cursor-agent -p --force --output-format stream-json${modelFlag}${resumeFlag} "${instruction}"`
```

---

### Gemini Agent

**CLI Package**: `@google/gemini-cli`
**Installation**: Automatic
**Default Model**: `gemini-3-pro-preview`
**Required API Key**: `gemini` provider

#### Available Models

```typescript
const AGENT_MODELS = {
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  ],
}
```

**Implementation** (`lib/sandbox/agents/gemini.ts`):
- Installation via `npm install -g @google/gemini-cli`
- Model configuration stored in Gemini settings.json
- MCP server support similar to Claude

---

### OpenCode Agent

**CLI Package**: `opencode-ai`
**Installation**: Automatic
**Default Model**: `gpt-5`
**Required API Keys**: Dynamic based on model (see section below)

#### Available Models

```typescript
const AGENT_MODELS = {
  opencode: [
    // Z.ai / Zhipu AI (New)
    { value: 'glm-4.7', label: 'GLM-4.7 (Coding Flagship)' },

    // Google Gemini 3 (New)
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },

    // OpenAI GPT Models
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 nano' },

    // Anthropic Claude 4.5 (Latest)
    { value: 'claude-opus-4-5-20251101', label: 'Claude 4.5 Opus' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude 4.5 Sonnet' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude 4.5 Haiku' },
  ],
}
```

#### Dynamic API Key Selection

```typescript
// From components/task-form.tsx (lines 176-188)
const getOpenCodeRequiredKeys = (model: string): Provider[] => {
  // Check if it's an Anthropic model (claude models)
  if (model.includes('claude') || model.includes('sonnet') || model.includes('opus')) {
    return ['anthropic']
  }
  // Check if it's an OpenAI/GPT model (uses AI Gateway)
  if (model.includes('gpt')) {
    return ['aigateway']
  }
  // Fallback to both if we can't determine
  return ['aigateway', 'anthropic']
}
```

**Key Feature**: Automatically determines required API key based on selected model.

---

## API Key Management

### User API Key Storage (API Route)

**File**: `app/api/api-keys/route.ts`

#### GET - Retrieve User's API Keys

```typescript
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userKeys = await db
      .select({
        provider: keys.provider,
        createdAt: keys.createdAt,
      })
      .from(keys)
      .where(eq(keys.userId, session.user.id))

    return NextResponse.json({
      success: true,
      apiKeys: userKeys,
    })
  } catch (error) {
    console.error('Error fetching API keys:', error)
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
  }
}
```

**Response Example**:
```json
{
  "success": true,
  "apiKeys": [
    { "provider": "anthropic", "createdAt": "2024-01-15T10:30:00Z" },
    { "provider": "openai", "createdAt": "2024-01-15T10:31:00Z" }
  ]
}
```

#### POST - Save/Update API Key

```typescript
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { provider, apiKey } = body as { provider: Provider; apiKey: string }

    // Validate inputs
    if (!['openai', 'gemini', 'cursor', 'anthropic', 'aigateway'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const encryptedKey = encrypt(apiKey)

    // Check if key already exists
    const existing = await db
      .select()
      .from(keys)
      .where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))
      .limit(1)

    if (existing.length > 0) {
      // Update existing
      await db.update(keys).set({
        value: encryptedKey,
        updatedAt: new Date(),
      }).where(...)
    } else {
      // Insert new
      await db.insert(keys).values({
        id: nanoid(),
        userId: session.user.id,
        provider,
        value: encryptedKey,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving API key:', error)
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
  }
}
```

#### DELETE - Remove API Key

```typescript
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const provider = searchParams.get('provider') as Provider

    await db.delete(keys).where(and(
      eq(keys.userId, session.user.id),
      eq(keys.provider, provider)
    ))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting API key:', error)
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }
}
```

### API Key Requirements by Agent

```typescript
// From components/task-form.tsx (lines 155-162)
const AGENT_API_KEY_REQUIREMENTS: Record<string, Provider[]> = {
  claude: [], // Will be determined dynamically based on selected model
  codex: ['aigateway'], // Uses AI Gateway for OpenAI proxy
  copilot: [], // Uses user's GitHub account token automatically
  cursor: ['cursor'],
  gemini: ['gemini'],
  opencode: [], // Will be determined dynamically based on selected model
}
```

---

## AI Gateway Integration

### Overview

Vercel AI Gateway is a unified API gateway for accessing multiple LLM providers through a single API endpoint. It provides:

- **Model routing**: Single API key to access OpenAI, Anthropic, Google, and other providers
- **Cost tracking**: Unified billing across multiple providers
- **Rate limiting**: Centralized rate limiting and quota management
- **Fallbacks**: Automatic fallback to secondary providers if primary fails

### Usage in Codebase

#### 1. Claude Agent with AI Gateway

The Claude agent uses AI Gateway automatically when:
- Selecting non-Anthropic models (GLM-4.7, Gemini, GPT)
- `AI_GATEWAY_API_KEY` is provided and takes priority over `ANTHROPIC_API_KEY`

```typescript
// lib/sandbox/agents/claude.ts
const hasAiGatewayKey = !!process.env.AI_GATEWAY_API_KEY
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
const useAiGateway = hasAiGatewayKey // Priority: AI Gateway first

if (useAiGateway) {
  // AI Gateway configuration via environment variables
  const envExport = [
    'export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"',
    `export ANTHROPIC_AUTH_TOKEN="${process.env.AI_GATEWAY_API_KEY}"`,
    'export ANTHROPIC_API_KEY=""',
  ].join(' && ')
}
```

**Supported Key Formats**:
- OpenAI: `sk-*` (direct OpenAI API key)
- Vercel AI Gateway: `vck_*` (Vercel's unified gateway key)

#### 2. Codex Agent with AI Gateway

Codex always uses AI Gateway:

```typescript
// lib/sandbox/agents/codex.ts
if (!process.env.AI_GATEWAY_API_KEY) {
  return {
    success: false,
    error: 'AI Gateway API key not found. Please set AI_GATEWAY_API_KEY environment variable.',
    cliName: 'codex',
    changesDetected: false,
  }
}

const apiKey = process.env.AI_GATEWAY_API_KEY
const isOpenAIKey = apiKey?.startsWith('sk-')
const isVercelKey = apiKey?.startsWith('vck_')
```

#### 3. Branch Name Generation with AI Gateway

Uses Vercel AI SDK 5 + AI Gateway for non-blocking branch name generation:

**File**: `lib/utils/branch-name-generator.ts`

```typescript
// Uses AI SDK 5 + AI Gateway to generate descriptive branch names
// Non-blocking via Next.js after() function
// Example outputs: feature/user-auth-A1b2C3, fix/memory-leak-X9y8Z7
```

### Benefits

1. **Single API key** instead of managing multiple keys
2. **Model portability** - switch models without code changes
3. **Cost optimization** - route to cheapest provider based on requirements
4. **Better observability** - unified metrics and logging
5. **Fallback support** - graceful degradation if provider has issues

### Configuration

Set `AI_GATEWAY_API_KEY` in `.env.local`:
```bash
# Vercel AI Gateway key format
AI_GATEWAY_API_KEY=vck_live_xxxxxxxxxxxxx

# Or OpenAI key if routing through AI Gateway
AI_GATEWAY_API_KEY=sk-xxxxxxxxxxxxx
```

---

## Agent Implementations

### File Structure

```
lib/sandbox/agents/
├── index.ts              # Main dispatcher and type definitions
├── claude.ts            # Claude Code agent implementation
├── codex.ts             # OpenAI Codex CLI implementation
├── copilot.ts           # GitHub Copilot CLI implementation
├── cursor.ts            # Cursor IDE CLI implementation
├── gemini.ts            # Google Gemini CLI implementation
└── opencode.ts          # OpenCode agent implementation
```

### Agent Dispatcher (index.ts)

The main entry point handles:
1. API key resolution (user keys override environment variables)
2. GitHub token setup for Copilot
3. Agent routing and execution
4. Environment variable restoration after execution

```typescript
// lib/sandbox/agents/index.ts
export async function executeAgentInSandbox(
  sandbox: Sandbox,
  instruction: string,
  agentType: AgentType,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  onCancellationCheck?: () => Promise<boolean>,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
  agentMessageId?: string,
): Promise<AgentExecutionResult>
```

**Parameters**:
- `sandbox`: Vercel Sandbox instance for command execution
- `instruction`: User's coding task description
- `agentType`: Which agent to use ('claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode')
- `logger`: TaskLogger for structured logging
- `selectedModel`: Specific model version to use (optional, uses agent default if not provided)
- `mcpServers`: MCP servers to configure (Claude only)
- `apiKeys`: User-provided API keys (override environment variables)
- `isResumed`: Whether resuming a previous conversation
- `sessionId`: Session ID for resumption

### Common Pattern Across Agents

All agents follow this pattern:

1. **Check CLI availability**
   ```typescript
   const cliCheck = await runAndLogCommand(sandbox, 'which', ['agent-cli'], logger)
   ```

2. **Install if needed**
   ```typescript
   if (!cliCheck.success) {
     const installResult = await runAndLogCommand(
       sandbox,
       'npm',
       ['install', '-g', '@package/agent-cli'],
       logger
     )
   }
   ```

3. **Build command with flags**
   ```typescript
   let fullCommand = `agent-cli --model "${modelToUse}" --dangerously-skip-permissions`
   if (isResumed && sessionId) {
     fullCommand += ` --resume "${sessionId}"`
   }
   fullCommand += ` "${instruction}"`
   ```

4. **Execute and stream output**
   ```typescript
   const result = await runInProject(sandbox, 'sh', ['-c', fullCommand])
   ```

5. **Parse and return results**
   ```typescript
   return {
     success: result.success,
     error: result.error,
     cliName: 'agent-name',
     changesDetected: checkForChanges(result.output),
   }
   ```

### Claude Agent Specifics (Most Complex)

**File**: `lib/sandbox/agents/claude.ts`

Key features:
- **Dual authentication**: Anthropic API or AI Gateway (automatic detection)
- **Alternative models**: Support for Google, OpenAI, and Z.ai models via AI Gateway
- **MCP server support** for extending capabilities (works with both auth methods)
- **Stream-JSON output format** for real-time streaming
- **Session management** for conversation resumption
- **Configuration file** creation in `~/.config/claude/config.json`
- **Streaming message storage** in database

**Installation**:
```typescript
const claudeInstall = await runCommandInSandbox(
  sandbox,
  'npm',
  ['install', '-g', '@anthropic-ai/claude-code']
)
```

**Configuration (Anthropic API)**:
```json
{
  "api_key": "sk-ant-...",
  "default_model": "claude-sonnet-4-5-20250929"
}
```

**Configuration (AI Gateway)**:
```bash
export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"
export ANTHROPIC_AUTH_TOKEN="vck_..."
export ANTHROPIC_API_KEY=""
```

**MCP Server Setup**:
```typescript
// For local STDIO servers
let addMcpCmd = `${envPrefix} claude mcp add "${serverName}" -- ${server.command}`

// For remote HTTP servers
let addMcpCmd = `${envPrefix} claude mcp add --transport http "${serverName}" "${server.baseUrl}"`
```

**Stream-JSON Output**:
```typescript
let fullCommand = `${envPrefix} claude --model "${modelToUse}" --dangerously-skip-permissions --output-format stream-json --verbose`
```

---

## Adding New Models

### Step 1: Update Model List in Task Form

**File**: `components/task-form.tsx` (lines 72-142)

```typescript
const AGENT_MODELS = {
  claude: [
    // Standard Anthropic Models (use ANTHROPIC_API_KEY)
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    // ADD NEW MODEL HERE
    { value: 'claude-new-model-20260101', label: 'New Model Label' },

    // AI Gateway Alternative Models (use AI_GATEWAY_API_KEY)
    { value: 'glm-4.7', label: 'GLM-4.7 (Coding Flagship)' },
    // ...
  ],
  // ...
}
```

### Step 2: Set Default Model (if needed)

**File**: `components/task-form.tsx` (lines 145-152)

```typescript
const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  // UPDATE IF THIS IS THE NEW DEFAULT
}
```

### Step 3: Pass Model to Agent

**File**: `lib/sandbox/agents/[agent].ts`

The `selectedModel` parameter is passed through the execution chain:

```typescript
const modelToUse = selectedModel || 'claude-sonnet-4-5-20250929'
// Use modelToUse in agent command
```

### Example: Adding Claude Model

```typescript
// 1. components/task-form.tsx
const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-opus-4-5-20251101', label: 'Opus 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    // NEW MODEL
    { value: 'claude-new-pro-20260101', label: 'New Pro (2026)' },
  ],
}

// 2. (Optional) Update default if this is the new preferred model
const DEFAULT_MODELS = {
  claude: 'claude-new-pro-20260101', // Updated default
}

// 3. The agent implementation automatically uses the model:
// In lib/sandbox/agents/claude.ts:
const modelToUse = selectedModel || 'claude-new-pro-20260101'
const configFileCmd = `... "default_model": "${modelToUse}" ...`
```

### Validation Considerations

1. **Model availability**: Verify the model is publicly available and not in beta
2. **API compatibility**: Ensure your API key has access to the model
3. **Testing**: Test the new model in a sandbox environment first
4. **Performance**: Consider model size/performance tradeoffs

---

## Adding New Providers

### Step 1: Update Database Schema

**File**: `lib/db/schema.ts` (lines 254-275)

```typescript
export const keys = pgTable(
  'keys',
  {
    // ...
    provider: text('provider', {
      enum: ['anthropic', 'openai', 'cursor', 'gemini', 'aigateway', 'NEW_PROVIDER'],
    }).notNull(),
    // ...
  },
  // ...
)
```

### Step 2: Update API Route

**File**: `app/api/api-keys/route.ts` (line 10)

```typescript
type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway' | 'NEW_PROVIDER'

// In POST handler validation:
if (!['openai', 'gemini', 'cursor', 'anthropic', 'aigateway', 'new-provider'].includes(provider)) {
  return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
}
```

### Step 3: Update User API Keys Module

**File**: `lib/api-keys/user-keys.ts` (lines 8-11, 68-73)

```typescript
type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway' | 'NEW_PROVIDER'

export async function getUserApiKeys(): Promise<{
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
  NEW_PROVIDER_API_KEY: string | undefined
}> {
  // ...
  const apiKeys = {
    // ...
    NEW_PROVIDER_API_KEY: process.env.NEW_PROVIDER_API_KEY,
  }

  userKeys.forEach((key) => {
    const decryptedValue = decrypt(key.value)

    switch (key.provider) {
      // ...
      case 'new-provider':
        apiKeys.NEW_PROVIDER_API_KEY = decryptedValue
        break
    }
  })
  // ...
}
```

### Step 4: Update Agent Dispatcher

**File**: `lib/sandbox/agents/index.ts` (lines 47-56)

```typescript
export async function executeAgentInSandbox(
  // ...
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
    NEW_PROVIDER_API_KEY?: string
  },
  // ...
) {
  const originalEnv = {
    // ...
    NEW_PROVIDER_API_KEY: process.env.NEW_PROVIDER_API_KEY,
  }

  if (apiKeys?.NEW_PROVIDER_API_KEY) process.env.NEW_PROVIDER_API_KEY = apiKeys.NEW_PROVIDER_API_KEY

  try {
    // ... agent routing ...
  } finally {
    process.env.NEW_PROVIDER_API_KEY = originalEnv.NEW_PROVIDER_API_KEY
  }
}
```

### Step 5: Create Agent Implementation (if adding new agent)

**File**: `lib/sandbox/agents/new-agent.ts`

```typescript
import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject } from '../commands'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors } from '@/lib/db/schema'

type Connector = typeof connectors.$inferSelect

export async function executeNewAgentInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
): Promise<AgentExecutionResult> {
  try {
    // 1. Check if CLI is installed
    const cliCheck = await runCommandInSandbox(sandbox, 'which', ['new-agent-cli'])

    if (!cliCheck.success) {
      // 2. Install CLI
      const installResult = await runCommandInSandbox(
        sandbox,
        'npm',
        ['install', '-g', '@package/new-agent-cli']
      )

      if (!installResult.success) {
        return {
          success: false,
          error: `Failed to install new agent CLI: ${installResult.error}`,
          cliName: 'new-agent',
          changesDetected: false,
        }
      }
    }

    // 3. Build command
    const modelToUse = selectedModel || 'default-model'
    let command = `new-agent-cli --model "${modelToUse}" "${instruction}"`

    if (isResumed && sessionId) {
      command += ` --resume "${sessionId}"`
    }

    // 4. Execute
    const result = await runInProject(sandbox, 'sh', ['-c', command])

    // 5. Return results
    return {
      success: result.success,
      error: result.error,
      cliName: 'new-agent',
      changesDetected: result.output?.includes('changes detected') || false,
    }
  } catch (error) {
    return {
      success: false,
      error: `Error executing new agent: ${error instanceof Error ? error.message : String(error)}`,
      cliName: 'new-agent',
      changesDetected: false,
    }
  }
}
```

### Step 6: Register Agent in Dispatcher

**File**: `lib/sandbox/agents/index.ts` (lines 1-10, 40-45)

```typescript
import { executeNewAgentInSandbox } from './new-agent'

export type AgentType = 'claude' | 'codex' | 'copilot' | 'cursor' | 'gemini' | 'opencode' | 'new-agent'

export async function executeAgentInSandbox(
  // ...
) {
  switch (agentType) {
    // ... existing cases ...
    case 'new-agent':
      return await executeNewAgentInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
      )
  }
}
```

### Step 7: Add to UI

**File**: `components/task-form.tsx` (lines 36-45)

```typescript
const CODING_AGENTS = [
  { value: 'multi-agent', label: 'Compare', icon: Users, isLogo: false },
  { value: 'divider', label: '', icon: () => null, isLogo: false, isDivider: true },
  { value: 'claude', label: 'Claude', icon: Claude, isLogo: true },
  { value: 'codex', label: 'Codex', icon: Codex, isLogo: true },
  { value: 'copilot', label: 'Copilot', icon: Copilot, isLogo: true },
  { value: 'cursor', label: 'Cursor', icon: Cursor, isLogo: true },
  { value: 'gemini', label: 'Gemini', icon: Gemini, isLogo: true },
  { value: 'opencode', label: 'opencode', icon: OpenCode, isLogo: true },
  { value: 'new-agent', label: 'New Agent', icon: NewAgentIcon, isLogo: true }, // NEW
]

const AGENT_MODELS = {
  // ...
  new_agent: [
    { value: 'default-model', label: 'Default Model' },
    { value: 'model-variant-1', label: 'Variant 1' },
  ],
}

const DEFAULT_MODELS = {
  // ...
  new_agent: 'default-model',
}

const AGENT_API_KEY_REQUIREMENTS = {
  // ...
  new_agent: ['new-provider'],
}
```

### Step 8: Environment Variables

Update `.env.local`:
```bash
# Add the new provider's API key
NEW_PROVIDER_API_KEY=your-api-key-here
```

---

## Security Considerations

### 1. Encryption at Rest

All API keys stored in the database are encrypted using AES-256-GCM:

```typescript
// lib/crypto.ts
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
}
```

**Key Derivation**: Uses `ENCRYPTION_KEY` environment variable (32-byte hex string).

### 2. No Dynamic Values in Logs

**CRITICAL RULE**: Never log API keys or sensitive user data.

```typescript
// BAD - NEVER DO THIS
await logger.error(`Failed with API key: ${apiKey}`)

// GOOD - Use static strings
await logger.error('API authentication failed')

// GOOD - Redact sensitive info
const redactedCommand = fullCommand.replace(process.env.ANTHROPIC_API_KEY!, '[REDACTED]')
await logger.command(redactedCommand)
```

See `CLAUDE.md` and `AGENTS.md` for complete logging guidelines.

### 3. User Scoping

All API key queries are filtered by `userId`:

```typescript
const userKey = await db
  .select({ value: keys.value })
  .from(keys)
  .where(and(
    eq(keys.userId, session.user.id),
    eq(keys.provider, provider)
  ))
```

**Users cannot access other users' API keys** - enforced at database query level.

### 4. Environment Variable Isolation

API keys are temporarily injected into `process.env` only during agent execution:

```typescript
// Store originals
const originalEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  // ...
}

// Set user keys
if (apiKeys?.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = apiKeys.ANTHROPIC_API_KEY
}

try {
  // Execute agent
} finally {
  // Restore originals
  process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY
}
```

### 5. GitHub Token Handling

GitHub OAuth tokens are:
- Encrypted in the database (via `accessToken` field)
- Only decrypted when needed for Copilot/Git operations
- Never logged or exposed in error messages

---

## Troubleshooting

### "API key not found"

**Problem**: Agent fails with "API key not found" error.

**Solutions**:
1. Check if user provided an API key in their profile settings
2. Verify environment variable is set on the server
3. Ensure API key is valid and has proper format:
   - Anthropic: `sk-ant-*`
   - OpenAI/AI Gateway: `sk-*` or `vck_*`
   - Cursor: Check Cursor documentation for format
   - Gemini: Check Google AI documentation for format

```bash
# Check environment variables on Vercel
vercel env list

# Check local environment
cat .env.local | grep API_KEY
```

### "Invalid API key format"

**Problem**: Codex agent rejects API key with format error.

**Solutions**:
```typescript
// Codex validation in lib/sandbox/agents/codex.ts
const apiKey = process.env.AI_GATEWAY_API_KEY
const isOpenAIKey = apiKey?.startsWith('sk-')
const isVercelKey = apiKey?.startsWith('vck_')

if (!apiKey || (!isOpenAIKey && !isVercelKey)) {
  // Error: provide correct format
}
```

Ensure API key starts with `sk-` (OpenAI) or `vck_` (Vercel AI Gateway).

### "Failed to install CLI"

**Problem**: Agent CLI installation fails in sandbox.

**Solutions**:
1. Verify npm is available: `npm --version`
2. Check package name is correct
3. Verify internet connectivity in sandbox
4. Check package is publicly available on npm registry

```bash
# Test in sandbox
npm info @anthropic-ai/claude-code
npm info @openai/codex
npm info @google/gemini-cli
```

### "Encryption key not found"

**Problem**: API keys can't be decrypted after retrieval from database.

**Solutions**:
1. Ensure `ENCRYPTION_KEY` is set in environment
2. Verify key format: must be 32-byte hex string (64 characters)
3. Check key hasn't changed (would make existing encrypted keys unreadable)

```bash
# Generate new key
openssl rand -hex 32

# Verify in environment
echo $ENCRYPTION_KEY
```

### "User not authenticated"

**Problem**: API key endpoints return "Unauthorized".

**Solutions**:
1. Verify user is logged in (check cookies)
2. Check session is valid
3. Verify `getSessionFromReq()` returns valid user
4. Check authentication provider is configured

```typescript
// In API route
const session = await getSessionFromReq(req)
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Model Not Available

**Problem**: Selected model not recognized by agent.

**Solutions**:
1. Verify model name is correct in `AGENT_MODELS` definition
2. Check model is available in agent's documentation
3. Ensure API key has access to the model
4. Test with default model first

```typescript
// Check available models in task-form.tsx
const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    // List your model here
  ],
}
```

---

## References

### Key Files

| File | Purpose |
|------|---------|
| `lib/db/schema.ts` | Database schema including keys table |
| `lib/api-keys/user-keys.ts` | API key retrieval with fallback logic |
| `app/api/api-keys/route.ts` | API endpoints for managing keys |
| `lib/sandbox/agents/index.ts` | Agent dispatcher and orchestrator |
| `lib/sandbox/agents/claude.ts` | Claude agent implementation with AI Gateway support |
| `lib/sandbox/agents/codex.ts` | Codex agent implementation |
| `lib/sandbox/agents/cursor.ts` | Cursor agent implementation |
| `lib/sandbox/agents/gemini.ts` | Gemini agent implementation |
| `lib/sandbox/agents/copilot.ts` | Copilot agent implementation |
| `lib/sandbox/agents/opencode.ts` | OpenCode agent implementation |
| `components/task-form.tsx` | Model and agent selection UI |
| `lib/crypto.ts` | Encryption/decryption utilities |

### Related Documentation

- `CLAUDE.md` - Project-specific guidelines
- `AGENTS.md` - Complete security and logging guidelines
- `README.md` - General project setup and features
- [Vercel AI SDK 5 Docs](https://sdk.vercel.ai/docs)
- [Vercel AI Gateway Docs](https://vercel.com/docs/ai-gateway)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs/)
- [Google Gemini API](https://ai.google.dev/)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | Jan 2025 | Added Claude AI Gateway support documentation |
| 1.0 | Jan 2025 | Initial comprehensive documentation |

---

**Last Updated**: January 15, 2025
**Maintained By**: Agentic Assets Team
