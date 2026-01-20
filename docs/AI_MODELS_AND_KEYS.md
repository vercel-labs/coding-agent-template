# API Models and Keys Documentation

This document provides complete information about API key management, authentication, and AI model configuration for the AA Coding Agent platform.

## Table of Contents

- [Overview](#overview)
- [Supported AI Providers](#supported-ai-providers)
- [API Key Management](#api-key-management)
- [Authentication Methods](#authentication-methods)
- [API Key Functions](#api-key-functions)
- [API Endpoints](#api-endpoints)
- [External API Token Security](#external-api-token-security)
- [Model Selection Guide](#model-selection-guide)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Overview

The AA Coding Agent platform supports multiple AI providers, each with specific API key requirements. Users can configure provider-specific API keys in the web UI Settings page, which are stored encrypted at rest. All API key operations require authentication via session cookie or API token.

### Key Concepts

- **Encryption at Rest**: All API keys are encrypted using AES-256-CBC before storage in the database
- **Decryption on Retrieval**: Keys are decrypted when retrieved for agent execution or display
- **Graceful Failure**: `decrypt()` returns `null` on failure; never throws exceptions
- **Fallback to System Keys**: If a user hasn't configured a key, or decryption fails, the system falls back to environment variables
- **User Override**: User-provided keys always take precedence over system environment variables (when decryption succeeds)
- **Dual Authentication**: API endpoints support both session cookies and Bearer API tokens

---

## Supported AI Providers

### Provider List

| Provider | Type | Models | Required Env Var | User Can Configure |
|----------|------|--------|------------------|--------------------|
| **Anthropic** | Claude models | claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5 | `ANTHROPIC_API_KEY` | Yes |
| **AI Gateway** | Multi-provider (Google, OpenAI, Z.ai) | gemini-3-pro, gpt-5.2, glm-4.7, minimax-m2.1, deepseek-v3.2 | `AI_GATEWAY_API_KEY` | Yes |
| **OpenAI** | GPT models | gpt-5.2, gpt-5.1-codex-mini | `OPENAI_API_KEY` | Yes |
| **Google Gemini** | Gemini models | gemini-3-pro-preview, gemini-3-flash-preview | `GEMINI_API_KEY` | Yes |
| **Cursor** | Cursor-specific models | auto, composer-1, sonnet-4.5 | `CURSOR_API_KEY` | Yes |

---

## Supported AI Models

### Claude Agent Models

Standard Anthropic models (require `ANTHROPIC_API_KEY`):
- `claude-sonnet-4-5-20250929` - Latest Sonnet (fastest)
- `claude-opus-4-5-20251101` - Latest Opus (most capable)
- `claude-haiku-4-5-20251001` - Latest Haiku (smallest)

AI Gateway models (require `AI_GATEWAY_API_KEY`):
- **Z.ai / Zhipu AI**: `glm-4.7` - GLM-4.7 (Coding Flagship)
- **MiniMax**: `minimax/minimax-m2.1` - MiniMax-M2.1
- **DeepSeek**: `deepseek/deepseek-v3.2-exp` - DeepSeek-V3.2
- **Xiaomi**: `xiaomi/mimo-v2-flash` - MiMo-V2-Flash
- **Google Gemini**: `gemini-3-pro-preview`, `gemini-3-flash-preview`
- **OpenAI**: `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.1-codex-mini`

### Codex Agent Models

All models require `AI_GATEWAY_API_KEY` for OpenAI API access:
- `openai/gpt-5.2` - GPT-5.2
- `openai/gpt-5.2-codex` - GPT-5.2-Codex
- `openai/gpt-5.1-codex-mini` - GPT-5.1-Codex mini
- `openai/gpt-5-mini` - GPT-5 mini
- `openai/gpt-5-nano` - GPT-5 nano

### Copilot Agent Models

Uses GitHub Copilot CLI (no API key required, uses GitHub account):
- `claude-sonnet-4.5` - Sonnet 4.5
- `claude-sonnet-4` - Sonnet 4
- `claude-haiku-4.5` - Haiku 4.5
- `gpt-5` - GPT-5

### Cursor Agent Models

Requires `CURSOR_API_KEY`:
- `auto` - Auto (Cursor decides)
- `composer-1` - Composer
- `sonnet-4.5` - Sonnet 4.5
- `sonnet-4.5-thinking` - Sonnet 4.5 Thinking
- `gpt-5` - GPT-5
- `gpt-5-codex` - GPT-5 Codex
- `opus-4.5` - Opus 4.5
- `opus-4.1` - Opus 4.1
- `grok` - Grok

### Gemini Agent Models

Requires `GEMINI_API_KEY`:
- `gemini-3-pro-preview` - Gemini 3 Pro Preview
- `gemini-3-flash-preview` - Gemini 3 Flash Preview

### OpenCode Agent Models

Z.ai / Zhipu AI (requires `AI_GATEWAY_API_KEY`):
- `glm-4.7` - GLM-4.7 (Coding Flagship)

Google Gemini (requires `GEMINI_API_KEY`):
- `gemini-3-flash-preview` - Gemini 3 Flash
- `gemini-3-pro-preview` - Gemini 3 Pro

OpenAI GPT (requires `AI_GATEWAY_API_KEY`):
- `gpt-5.2` - GPT-5.2
- `gpt-5.2-codex` - GPT-5.2-Codex
- `gpt-5.1-codex-mini` - GPT-5.1-Codex-Mini
- `gpt-5-mini` - GPT-5 mini
- `gpt-5-nano` - GPT-5 nano

Anthropic Claude (requires `ANTHROPIC_API_KEY`):
- `claude-opus-4-5-20251101` - Claude 4.5 Opus
- `claude-sonnet-4-5-20250929` - Claude 4.5 Sonnet
- `claude-haiku-4-5-20251001` - Claude 4.5 Haiku

---

## API Key Management

### Overview

API keys are stored encrypted in the `keys` database table with the following structure:

```typescript
{
  id: string                    // Unique identifier
  userId: string                // User who owns this key
  provider: Provider             // 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'
  value: string                 // AES-256-GCM encrypted key
  createdAt: Date              // Creation timestamp
  updatedAt: Date              // Last update timestamp
}
```

### User Interface

Users manage API keys through the **Settings** page (`/settings`):

1. Navigate to **API Keys** section
2. Enter your provider-specific API key
3. Click **Save** to encrypt and store
4. Click **Delete** to remove a key

Keys are never displayed in plain text after initial input (except in GET endpoint for convenience).

---

## Authentication Methods

### 1. Session Cookie Authentication (Web UI)

Used by all web UI API calls. The session is created during OAuth login and persists as an HTTP-only cookie.

**How it works:**
1. User signs in via OAuth (GitHub or Vercel)
2. Encrypted JWE session token created and stored in `__Secure-session` cookie
3. All subsequent requests automatically include the cookie
4. API routes validate session and extract `userId`

**Example:**
```typescript
const session = await getSessionFromReq(req)
const userId = session?.user?.id
```

### 2. Bearer Token Authentication (External API Access)

Used by external applications and MCP clients via API tokens.

**How it works:**
1. User generates API token in Settings page (`/settings#api-tokens`)
2. Raw token displayed once (cannot be retrieved later)
3. Token is SHA256 hashed and stored in `apiTokens` table
4. External apps include token in request: `Authorization: Bearer <token>`
5. API validates by hashing incoming token and comparing with stored hash

**Example:**
```bash
curl -X POST "https://your-domain.com/api/tasks" \
  -H "Authorization: Bearer your_api_token_here" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "...","repoUrl": "..."}'
```

### 3. Dual-Auth Priority (Both Methods)

Some endpoints support both authentication methods with the following priority:

1. **Bearer Token** - If `Authorization: Bearer xxx` header present, use API token auth
2. **Session Cookie** - If no Bearer token, fall back to session cookie
3. **Unauthenticated** - If neither present, return 401 Unauthorized

**Query Parameter Method** (MCP servers):

For MCP clients that don't support custom headers, tokens can be passed as query parameters:

```
https://your-domain.com/api/mcp?apikey=YOUR_API_TOKEN
```

The auth middleware automatically transforms the query parameter to an `Authorization: Bearer` header internally.

**Important**: Query parameters appear in URLs and logs. Always use HTTPS to prevent token interception.

---

## API Key Functions

Functions for retrieving and managing API keys are located in `@lib/api-keys/user-keys.ts`.

### getUserApiKeys()

Get all API keys for a user.

**Signature:**
```typescript
export async function getUserApiKeys(userId?: string): Promise<{
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
}>
```

**Parameters:**
- `userId` (optional) - User ID for API token authentication. If not provided, uses current session.

**Returns:**
- Object with provider names mapped to decrypted API key values (or undefined if not set)
- User-provided keys override system environment variables

**Usage Example - Session Authentication:**
```typescript
// Called from an API route with session cookie
const keys = await getUserApiKeys()
console.log(keys.ANTHROPIC_API_KEY)  // Returns decrypted key or env var fallback
```

**Usage Example - API Token Authentication:**
```typescript
// Called with explicit userId from API token auth
const keys = await getUserApiKeys('user-123')
console.log(keys.OPENAI_API_KEY)  // Returns user's key or env var fallback
```

**Key Behavior:**
- If `userId` is provided, fetches from database for that user
- If `userId` is not provided, attempts to get from session; falls back to system env vars
- Returns system keys if user has no keys configured
- `decrypt()` returns `null` on failure (invalid format, corrupted data, missing ENCRYPTION_KEY); falls back to env vars automatically
- Decryption errors are logged but don't throw; system env vars serve as fallback

### getUserApiKey()

Get a single API key for a specific provider (more efficient than `getUserApiKeys()` if only one key needed).

**Signature:**
```typescript
export async function getUserApiKey(
  provider: Provider,
  userId?: string
): Promise<string | undefined>
```

**Parameters:**
- `provider` - One of: `'openai'` | `'gemini'` | `'cursor'` | `'anthropic'` | `'aigateway'`
- `userId` (optional) - User ID for API token authentication. If not provided, uses current session.

**Returns:**
- Decrypted API key value, or undefined if not set (will fall back to system env var)

**Usage Example - Session Authentication:**
```typescript
// Called from an API route with session cookie
const anthropicKey = await getUserApiKey('anthropic')
```

**Usage Example - API Token Authentication:**
```typescript
// Called with explicit userId from API token auth
const openaiKey = await getUserApiKey('openai', 'user-123')
```

**Key Behavior:**
- User key always overrides system environment variable
- Returns system env var if user hasn't configured a key
- Never returns undefined for agent execution (always has fallback)

---

## API Endpoints

### GET /api/api-keys

Retrieve all API keys configured by the user.

**Authentication:** Session required (via `getSessionFromReq()`)

**Query Parameters:** None

**Response:**
```json
{
  "success": true,
  "apiKeys": [
    {
      "provider": "anthropic",
      "value": "sk-ant-xxx...xxx",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "provider": "openai",
      "value": "sk-xxx...xxx",
      "createdAt": "2024-01-15T10:31:00Z"
    }
  ]
}
```

**Important Notes:**
- Values are **decrypted** (keys are shown in plain text)
- This is intentional for user convenience in Settings page
- Keys are encrypted at rest in database; decrypted only on retrieval
- Never expose this endpoint to untrusted clients

**Error Responses:**

```json
// 401 Unauthorized
{
  "error": "Unauthorized"
}
```

```json
// 500 Server Error
{
  "error": "Failed to fetch API keys"
}
```

### POST /api/api-keys

Create or update an API key for a provider (upsert pattern).

**Authentication:** Session required (via `getSessionFromReq()`)

**Request Body:**
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-..."
}
```

**Parameters:**
- `provider` - Required. One of: `'openai'` | `'gemini'` | `'cursor'` | `'anthropic'` | `'aigateway'`
- `apiKey` - Required. The API key value to store (will be encrypted)

**Response:**
```json
{
  "success": true
}
```

**Behavior:**
- If key already exists for provider+userId, updates the value
- If key doesn't exist, creates new record
- Key is encrypted before storage using AES-256-GCM
- `updatedAt` timestamp is automatically set

**Error Responses:**

```json
// 400 Missing Provider or API Key
{
  "error": "Provider and API key are required"
}
```

```json
// 400 Invalid Provider
{
  "error": "Invalid provider"
}
```

```json
// 401 Unauthorized
{
  "error": "Unauthorized"
}
```

```json
// 500 Server Error
{
  "error": "Failed to save API key"
}
```

### DELETE /api/api-keys

Delete an API key for a specific provider.

**Authentication:** Session required (via `getSessionFromReq()`)

**Query Parameters:**
- `provider` - Required. The provider to delete: `'openai'` | `'gemini'` | `'cursor'` | `'anthropic'` | `'aigateway'`

**Example:**
```
DELETE /api/api-keys?provider=anthropic
```

**Response:**
```json
{
  "success": true
}
```

**Behavior:**
- Deletes the API key record for the specified provider
- After deletion, system will fall back to environment variables for that provider
- No error if key doesn't exist (idempotent)

**Error Responses:**

```json
// 400 Missing Provider
{
  "error": "Provider is required"
}
```

```json
// 401 Unauthorized
{
  "error": "Unauthorized"
}
```

```json
// 500 Server Error
{
  "error": "Failed to delete API key"
}
```

### GET /api/api-keys/check

Check which API keys are available for a given agent and model.

**Authentication:** Session NOT required (public endpoint)

**Query Parameters:**
- `agent` - Required. One of: `'claude'` | `'codex'` | `'copilot'` | `'cursor'` | `'gemini'` | `'opencode'`
- `model` - Optional. The selected model (used for multi-provider agents to determine key requirement)

**Example Requests:**
```
GET /api/api-keys/check?agent=claude
GET /api/api-keys/check?agent=claude&model=claude-sonnet-4-5-20250929
GET /api/api-keys/check?agent=opencode&model=gpt-5.2
```

**Response:**
```json
{
  "success": true,
  "hasKey": true,
  "provider": "anthropic",
  "agentName": "Claude"
}
```

**Response Fields:**
- `hasKey` - Boolean: true if user has key configured (or system has fallback env var)
- `provider` - The provider required for the selected agent/model combination
- `agentName` - Human-readable agent name

**Behavior:**
- Supports multi-provider agents (Claude, Cursor, OpenCode)
  - Claude Anthropic models → requires `ANTHROPIC_API_KEY`
  - Claude AI Gateway models → requires `AI_GATEWAY_API_KEY`
  - OpenCode with GPT → requires `AI_GATEWAY_API_KEY`
  - OpenCode with Claude → requires `ANTHROPIC_API_KEY`
- Copilot special case:
  - Returns `"provider": "github"`
  - `hasKey` based on GitHub token availability
- Falls back to system environment variables

**Error Responses:**

```json
// 400 Missing Agent
{
  "error": "Agent parameter is required"
}
```

```json
// 400 Invalid Agent
{
  "error": "Invalid agent"
}
```

```json
// 500 Server Error
{
  "error": "Failed to check API key"
}
```

---

## External API Token Security

API tokens enable external applications and MCP clients to access the platform without OAuth session cookies.

### Token Generation

**Location:** Settings page (`/settings#api-tokens`)

**How to Generate:**
1. Sign in to the web application
2. Navigate to **Settings > API Tokens**
3. Click **Generate New Token**
4. Optionally set expiration date
5. Copy token immediately (shown only once)

### Token Storage

**Security Model:**
- Raw token: 32 random bytes (64 character hex string)
- Stored value: SHA256 hash of raw token
- Raw token **never stored** in database
- Lost tokens cannot be recovered (must generate new)

**Example:**
```
Raw token (shown once): a1b2c3d4e5f6g7h8i9j0...
Stored hash (database): 2c26b46911185131006...
```

When API request includes token, the system:
1. Extracts token from header/query parameter
2. Computes SHA256 hash
3. Compares with stored hash
4. Validates match and expiration

### Token Usage

**Maximum Tokens:** 20 tokens per user

**Expiration:**
- Optional expiration date can be set at creation
- Expired tokens return 401 Unauthorized
- No automatic cleanup; expired tokens must be deleted manually

**Supported Endpoints:**
- All `/api/tasks/*` endpoints
- All `/api/tokens/*` endpoints
- `/api/mcp` endpoint (MCP protocol)

### Token Rotation Best Practices

1. **Regular Rotation**: Generate new tokens periodically
2. **Short Expiration**: Set 30-90 day expiration for temporary access
3. **Revocation**: Delete tokens immediately if compromised
4. **Environment Isolation**: Use separate tokens for development/production/staging
5. **Monitoring**: Check token usage in Settings page
6. **Avoid Hardcoding**: Store tokens in environment variables, never in code

### Rate Limiting

API token requests count toward the same rate limit as web UI:
- **Default:** 20 task creations + follow-ups per day
- **Admin:** 100 per day
- **Reset:** Midnight UTC daily

Token management endpoints (`GET`, `DELETE` on `/api/tokens`) are not rate-limited.

---

## Model Selection Guide

### Choosing the Right Model

#### For Fastest Performance
- **Claude:** `claude-haiku-4-5-20251001` (requires `ANTHROPIC_API_KEY`)
- **OpenAI:** `gpt-5-nano`, `gpt-5-mini` (requires `AI_GATEWAY_API_KEY`)
- **Gemini:** `gemini-3-flash-preview` (requires `GEMINI_API_KEY`)

#### For Best Quality
- **Claude:** `claude-opus-4-5-20251101` (requires `ANTHROPIC_API_KEY`)
- **OpenAI:** `gpt-5.2` (requires `AI_GATEWAY_API_KEY`)
- **Gemini:** `gemini-3-pro-preview` (requires `GEMINI_API_KEY`)

#### For Balanced Performance
- **Claude:** `claude-sonnet-4-5-20250929` (requires `ANTHROPIC_API_KEY`) - **Recommended default**
- **OpenAI:** `gpt-5.2-codex` (requires `AI_GATEWAY_API_KEY`)

#### For Code Generation
- **Claude Codex:** All `gpt-5.*-codex` models (requires `AI_GATEWAY_API_KEY`)
- **Cursor:** `composer-1` (requires `CURSOR_API_KEY`)
- **OpenCode:** `glm-4.7` (Coding Flagship, requires `AI_GATEWAY_API_KEY`)

#### For Alternative Providers
- **Z.ai / Zhipu AI:** `glm-4.7` (requires `AI_GATEWAY_API_KEY`)
- **MiniMax:** `minimax/minimax-m2.1` (requires `AI_GATEWAY_API_KEY`)
- **DeepSeek:** `deepseek/deepseek-v3.2-exp` (requires `AI_GATEWAY_API_KEY`)

### API Key Requirements by Agent

| Agent | Default Model | Required Keys | Notes |
|-------|---------------|---------------|-------|
| Claude | claude-sonnet-4-5-20250929 | ANTHROPIC or AI_GATEWAY | Multi-provider: model determines key |
| Codex | openai/gpt-5.1-codex-mini | AI_GATEWAY | Always requires AI Gateway |
| Copilot | claude-sonnet-4.5 | None (GitHub) | Uses user's GitHub token |
| Cursor | auto | CURSOR_API_KEY | Cursor-specific API key |
| Gemini | gemini-3-pro-preview | GEMINI_API_KEY | Google Gemini API key |
| OpenCode | gpt-5.1-codex-mini | ANTHROPIC or AI_GATEWAY | Multi-provider: model determines key |

---

## Error Handling

### Common Error Scenarios

#### Missing API Key

**Symptom:** Task fails to start with "API key not found" message

**Solution:**
1. Navigate to Settings > API Keys
2. Add API key for required provider
3. Retry the task

#### Invalid API Key

**Symptom:** Task fails during execution with "Invalid API key" error

**Solution:**
1. Verify key is correct (copy from provider's dashboard)
2. Delete the invalid key from Settings
3. Re-enter the key exactly as provided by provider
4. Test with GET `/api/api-keys` to verify it's stored

#### Token Expired

**Symptom:** "Authentication required" or "API token expired" error

**Solution:**
1. Generate new API token from Settings > API Tokens
2. Update MCP client configuration with new token
3. Delete expired token from Settings

#### Rate Limit Exceeded

**Symptom:** "You have reached your daily message limit"

**Solution:**
1. Check your usage in Settings > API Activity
2. Wait until midnight UTC for limits to reset
3. Contact admin if you need higher limits
4. Optimize usage by batching operations

#### Decryption Failures (Silent Fallback)

**Note:** If a stored API key fails to decrypt (corrupted data, invalid format, or missing ENCRYPTION_KEY), the system automatically falls back to the environment variable value. No error is raised to the user. Decryption failures are logged server-side and should be reported to administrators if persistent.

### HTTP Status Codes

- `200 OK` - Successful request
- `400 Bad Request` - Invalid provider, missing parameter, or invalid input
- `401 Unauthorized` - Missing authentication or invalid token
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server-side error (decryption failure, database error)

---

## Rate Limiting

### Rate Limit Policy

The platform enforces rate limits on task creation and follow-up messages:

- **Default Users:** 20 tasks + follow-ups per day
- **Admin Domains:** 100 tasks + follow-ups per day (email domain in `NEXT_PUBLIC_ADMIN_EMAIL_DOMAINS`)
- **Reset Time:** Midnight UTC daily

### What Counts Toward Rate Limit

- Creating new task (via UI or MCP `create-task` tool)
- Sending follow-up message (via UI or MCP `continue-task` tool)
- API key management operations do NOT count
- Token management operations do NOT count

### Rate Limit Headers

Responses include rate limit information (if available):

```json
{
  "remaining": 5,
  "total": 20,
  "resetAt": "2026-01-21T00:00:00Z"
}
```

### Handling Rate Limits

1. **Monitor Usage:** Check `remaining` count before creating tasks
2. **Plan Ahead:** Batch operations during off-peak hours
3. **Exponential Backoff:** Implement retry logic with delays for automated clients
4. **Request Increase:** Contact administrator for higher limits

---

## Additional Resources

- **MCP Server Documentation:** See `@docs/MCP_SERVER.md` for MCP server configuration and client setup
- **Task Execution:** See `@CLAUDE.md` for task processing workflow and agent execution
- **Authentication Details:** See `@lib/auth/api-token.ts` for dual-auth implementation
- **API Key Implementation:** See `@lib/api-keys/user-keys.ts` for retrieval functions
