# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-agent AI coding assistant platform built with Next.js 15 and React 19. It enables users to execute automated coding tasks through various AI agents (Claude, Codex, Copilot, Cursor, Gemini, OpenCode) running in isolated Vercel sandboxes. The app supports multi-user authentication, task management, MCP server integration, and GitHub repository access.

## Core Architecture

### Technology Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes, Drizzle ORM, PostgreSQL (Supabase)
- **AI**: Vercel AI SDK 5, multiple AI agent CLIs (Claude Code, Codex, Copilot, Cursor, Gemini, OpenCode)
- **Execution**: Vercel Sandbox (isolated container environments)
- **Auth**: OAuth (GitHub, Vercel), encrypted session tokens (JWE)
- **Database**: PostgreSQL (Supabase) with Drizzle ORM

### Key Directories
- `app/` - Next.js App Router pages and API routes
- `lib/` - Core business logic, utilities, and services
- `lib/sandbox/` - Sandbox creation, agent execution, Git operations
- `lib/sandbox/agents/` - AI agent implementations (claude.ts, codex.ts, etc.)
- `lib/db/` - Database schema and migrations
- `lib/auth/` - Authentication and session management
- `components/` - React UI components
- `scripts/` - Database migration and utility scripts

### Database Schema (lib/db/schema.ts)
- **users** - User profiles and primary OAuth accounts
- **accounts** - Additional linked accounts (e.g., Vercel users connecting GitHub)
- **keys** - User-specific API keys (Anthropic, OpenAI, Cursor, Gemini, AI Gateway)
- **tasks** - Coding tasks with logs, status, PR info, sandbox IDs
- **taskMessages** - Chat messages between users and agents
- **connectors** - MCP server configurations
- **settings** - User-specific settings (key-value pairs)

## Development Workflow

### Initial Project Setup
**First-time setup requires environment variable workaround for drizzle-kit:**
```bash
# 1. Install dependencies
pnpm install

# 2. Ensure .env.local exists with all required environment variables

# 3. Apply database migrations (drizzle-kit doesn't auto-load .env.local)
cp .env.local .env
DOTENV_CONFIG_PATH=.env pnpm tsx -r dotenv/config node_modules/drizzle-kit/bin.cjs migrate
rm .env  # Clean up temporary file
```

### Common Commands
```bash
# Install dependencies
pnpm install

# Development (DO NOT RUN - see AGENTS.md)
# pnpm dev

# Build for production (cloud-first, deploy via Vercel)
git add . && git commit -m "msg" && git push origin <branch>

# Database operations
pnpm db:generate    # Generate migrations from schema changes
pnpm db:studio      # Open Drizzle Studio

# Database migrations (requires .env.local → .env workaround)
cp .env.local .env && DOTENV_CONFIG_PATH=.env pnpm tsx -r dotenv/config node_modules/drizzle-kit/bin.cjs migrate && rm .env

# Code quality
pnpm format         # Format code with Prettier
pnpm format:check   # Check formatting
pnpm type-check     # TypeScript type checking
pnpm lint           # ESLint linting
```

### CRITICAL: Code Quality Requirements
**ALWAYS run these commands after editing TypeScript/TSX files:**
```bash
pnpm format
pnpm type-check
pnpm lint
```
All errors must be resolved before considering work complete.

### CRITICAL: Never Run Dev Servers
**DO NOT run `pnpm dev`, `next dev`, or any long-running development servers.** They block the terminal and conflict with existing instances. Use `pnpm build` to verify builds or let the user start servers themselves. See AGENTS.md for full rationale.

### Cloud-First Deployment
Never build locally - push changes to trigger Vercel deployment:
```bash
vercel env pull && vercel link  # Initial setup
git add . && git commit -m "msg" && git push origin <branch>
vercel inspect <deployment-url> --wait  # Monitor deployment
```

## Security & Logging (CRITICAL)

### No Dynamic Values in Logs
**ALL log statements MUST use static strings only. NEVER include dynamic values.**

Bad (DO NOT DO):
```typescript
await logger.info(`Task created: ${taskId}`)
await logger.error(`Failed: ${error.message}`)
```

Good (DO THIS):
```typescript
await logger.info('Task created')
await logger.error('Operation failed')
```

**Rationale**: Logs are displayed directly in the UI and can expose sensitive data (user IDs, tokens, file paths, credentials). This applies to all log levels (info, error, success, command) and all logging methods (logger, console.log, console.error).

### Sensitive Data That Must NEVER Appear in Logs
- Vercel credentials (SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID)
- API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- User IDs, emails, personal information
- File paths, repository URLs, branch names
- GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
- Any dynamic values revealing system internals

See `AGENTS.md` for complete security guidelines and redaction patterns.

## AI Agent System

### Agent Implementations (lib/sandbox/agents/)
Each agent file (claude.ts, codex.ts, copilot.ts, cursor.ts, gemini.ts, opencode.ts) implements:
- `runAgent()` - Main execution function
- Logging with TaskLogger
- Sandbox command execution
- Git operations (commit, push)
- Model selection logic
- API key handling (user keys override env vars)

### Claude Agent - AI Gateway Support
The Claude agent supports two authentication methods with automatic detection:

**Direct Anthropic API** (for Anthropic models):
- Uses `ANTHROPIC_API_KEY`
- Supports Claude models: `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101`, etc.
- Configuration file: `~/.config/claude/config.json`

**AI Gateway** (for alternative models):
- Uses `AI_GATEWAY_API_KEY` (automatic priority if both keys present)
- Supports alternative models:
  - **Google**: `gemini-3-pro-preview`, `gemini-3-flash-preview`
  - **OpenAI**: `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.1-codex-mini`
  - **Z.ai/Zhipu**: `glm-4.7`
- Environment setup:
  ```
  ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"
  ANTHROPIC_AUTH_TOKEN=<AI_GATEWAY_API_KEY>
  ANTHROPIC_API_KEY=""
  ```
- Works with MCP servers (no configuration changes needed)

**API Key Priority Logic** (`lib/sandbox/agents/claude.ts`):
1. Check if `AI_GATEWAY_API_KEY` is available (preferred)
2. Fall back to `ANTHROPIC_API_KEY`
3. Return error if neither is available

**Model Selection Logic** (`components/task-form.tsx`):
```typescript
const getClaudeRequiredKeys = (model: string): Provider[] => {
  if (model.startsWith('claude-')) {
    return ['anthropic']  // Anthropic models need ANTHROPIC_API_KEY
  }
  return ['aigateway']    // All other models need AI_GATEWAY_API_KEY
}
```

### Sandbox Workflow (lib/sandbox/creation.ts)
1. **Validate credentials** - Check Vercel API tokens, user GitHub access
2. **Create sandbox** - Provision Vercel sandbox with repo
3. **Setup environment** - Configure API keys, NPM tokens, MCP servers
4. **Install dependencies** - Detect package manager (npm/pnpm/yarn), run install if needed
5. **Execute agent** - Run selected AI agent CLI
6. **Git operations** - Commit changes, push to AI-generated branch
7. **Cleanup** - Shutdown sandbox unless keepAlive is enabled

### MCP Server Support (Claude Only)
MCP servers extend Claude Code with additional tools. Configured in `connectors` table with:
- `type: 'local'` - Local CLI command
- `type: 'remote'` - Remote HTTP endpoint
- Encrypted environment variables and OAuth credentials
- Works with both Anthropic API and AI Gateway authentication methods

## API Architecture

### Authentication Flow
1. User signs in via OAuth (GitHub or Vercel)
2. Create/update user record in `users` table with encrypted access token
3. Create encrypted session token (JWE) stored in HTTP-only cookie
4. All API routes validate session via `getCurrentUser()` from `lib/auth/session.ts`
5. Users can connect additional accounts (e.g., Vercel users connect GitHub) stored in `accounts` table

### Key API Routes
- `app/api/auth/` - OAuth callbacks, sign-in/sign-out, GitHub connection
- `app/api/tasks/` - Task CRUD, execution, logs, follow-up messages
- `app/api/github/` - Repository access, org/repo listing, PR operations
- `app/api/repos/[owner]/[repo]/` - Commits, issues, pull requests
- `app/api/connectors/` - MCP server management
- `app/api/api-keys/` - User API key management
- `app/api/sandboxes/` - Sandbox creation and management

### Rate Limiting
Default: 20 tasks + follow-ups per user per day (configurable via `MAX_MESSAGES_PER_DAY` env var). Admin domains in `NEXT_PUBLIC_ADMIN_EMAIL_DOMAINS` get 100/day. See `lib/utils/rate-limit.ts`.

## UI Component Guidelines

### Using shadcn/ui Components
**Always check if a shadcn component exists before creating new UI components:**
```bash
pnpm dlx shadcn@latest add <component-name>
```
Existing components in `components/ui/`. See https://ui.shadcn.com/ for available components.

### Repository Page Structure
Nested routing with shared layout and separate pages per tab:
```
app/repos/[owner]/[repo]/
├── layout.tsx           # Shared layout with tab navigation
├── page.tsx            # Redirects to /commits
├── commits/page.tsx
├── issues/page.tsx
└── pull-requests/page.tsx
```

Adding new tabs:
1. Create `app/repos/[owner]/[repo]/[tab-name]/page.tsx`
2. Create component in `components/repo-[tab-name].tsx`
3. Add API route in `app/api/repos/[owner]/[repo]/[tab-name]/route.ts`
4. Update `tabs` array in `components/repo-layout.tsx`

## Environment Variables

**All environment variables must be stored in `.env.local` (not `.env`)** for local development. Next.js automatically loads `.env.local`, but drizzle-kit requires a workaround (see Database operations above).

### Required (App Infrastructure)
- `POSTGRES_URL` - Supabase PostgreSQL connection string (from Supabase project settings)
- `SANDBOX_VERCEL_TOKEN` - Vercel API token for sandbox creation
- `SANDBOX_VERCEL_TEAM_ID` - Vercel team ID
- `SANDBOX_VERCEL_PROJECT_ID` - Vercel project ID
- `JWE_SECRET` - Session encryption secret (generate: `openssl rand -base64 32`)
- `ENCRYPTION_KEY` - API key/token encryption (generate: `openssl rand -hex 32`)

### Authentication (At Least One Required)
- `NEXT_PUBLIC_AUTH_PROVIDERS` - Comma-separated: "github", "vercel", or "github,vercel"
- **GitHub**: `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- **Vercel**: `NEXT_PUBLIC_VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`

### Optional (Global Fallbacks - Users Can Override)
- `ANTHROPIC_API_KEY` - Claude agent with Anthropic models (claude-*)
- `AI_GATEWAY_API_KEY` - Claude agent with alternative models + branch name generation + Codex
- `OPENAI_API_KEY` - Codex/OpenCode agents
- `CURSOR_API_KEY` - Cursor agent
- `GEMINI_API_KEY` - Gemini agent
- `NPM_TOKEN` - Private npm packages
- `MAX_SANDBOX_DURATION` - Default max duration in minutes (default: 300)
- `MAX_MESSAGES_PER_DAY` - Rate limit (default: 20)
- `NEXT_PUBLIC_ADMIN_EMAIL_DOMAINS` - Admin email domains for 100/day limit

## Key Implementation Patterns

### User-Scoped Data Access
All database queries filter by `userId`. Users can only access their own tasks, connectors, API keys:
```typescript
const tasks = await db.query.tasks.findMany({
  where: eq(tasks.userId, user.id),
})
```

### Encryption for Sensitive Data
All tokens, API keys, and OAuth credentials are encrypted at rest using `lib/crypto.ts`:
```typescript
import { encrypt, decrypt } from '@/lib/crypto'

// Storing
const encryptedToken = encrypt(token)
await db.insert(users).values({ accessToken: encryptedToken })

// Retrieving
const decryptedToken = decrypt(user.accessToken)
```

### API Key Priority (User > Global)
Check user-provided keys first, fall back to environment variables:
```typescript
const anthropicKey = await getUserApiKey(userId, 'anthropic') || process.env.ANTHROPIC_API_KEY
```

### Task Logging with TaskLogger
Use `lib/utils/task-logger.ts` for structured, real-time task logs:
```typescript
const logger = new TaskLogger(taskId)
await logger.info('Operation started')
await logger.updateProgress(50, 'Processing')
await logger.success('Completed')
await logger.error('Failed')
```

### AI Branch Name Generation
Uses Vercel AI SDK 5 + AI Gateway in `lib/actions/generate-branch-name.ts`:
- Non-blocking (Next.js 15 `after()` function)
- Descriptive names like `feature/user-auth-A1b2C3` or `fix/memory-leak-X9y8Z7`
- Fallback to timestamp-based names on failure
- Includes 6-character hash to prevent conflicts

## Common Development Tasks

### Adding a New AI Agent
1. Create `lib/sandbox/agents/new-agent.ts` implementing `runAgent()` function
2. Add agent to `selectedAgent` enum in `lib/db/schema.ts` (tasks table)
3. Add to agent selection UI in `components/task-form.tsx`
4. Add API key support in `keys` table schema if needed
5. Update agent index in `lib/sandbox/agents/index.ts`

### Database Schema Changes
1. Edit `lib/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Apply to local DB (requires workaround):
   ```bash
   cp .env.local .env
   DOTENV_CONFIG_PATH=.env pnpm tsx -r dotenv/config node_modules/drizzle-kit/bin.cjs migrate
   rm .env
   ```
4. Test changes locally
5. Deploy: Push to Git (migrations auto-run on Vercel)

### Adding New API Routes
1. Create route file in `app/api/[path]/route.ts`
2. Import session validation: `import { getCurrentUser } from '@/lib/auth/session'`
3. Validate user: `const user = await getCurrentUser()`
4. Filter queries by `userId`
5. Use static log messages (no dynamic values)

## Testing & Verification

### Pre-Deployment Checklist
- [ ] Run `pnpm format` - Code is properly formatted
- [ ] Run `pnpm type-check` - No TypeScript errors
- [ ] Run `pnpm lint` - No linting errors
- [ ] All log statements use static strings (no dynamic values)
- [ ] No sensitive data in logs or error messages
- [ ] User-scoped data access (filter by userId)
- [ ] Encryption used for tokens/API keys
- [ ] No long-running processes (dev servers, nodemon, etc.)

### Breaking Changes in v2.0
- All tables now require `userId` foreign key
- API routes require authentication
- `GITHUB_TOKEN` no longer used as fallback (users provide their own)
- Connector `env` changed from jsonb to encrypted text
- See README.md "Changelog" section for full migration guide

## Additional Resources

- **AGENTS.md** - Complete security guidelines, logging rules, repo page architecture
- **AI_MODELS_AND_KEYS.md** - Comprehensive API key and model documentation
- **README.md** - Full setup instructions, OAuth configuration, deployment guide
- **Vercel Sandbox Docs** - https://vercel.com/docs/vercel-sandbox
- **Vercel AI SDK 5** - https://sdk.vercel.ai/docs
- **Vercel AI Gateway** - https://vercel.com/docs/ai-gateway
- **Drizzle ORM** - https://orm.drizzle.team/docs/overview
- **shadcn/ui** - https://ui.shadcn.com/

## Important Reminders

1. **Never log dynamic values** - Use static strings in all logger/console statements
2. **Always run code quality checks** - format, type-check, lint after editing TS/TSX
3. **Never run dev servers** - Use build verification or let user start servers
4. **Cloud-first deployment** - Push to Git, let Vercel handle builds
5. **User-scoped access** - Filter all queries by userId
6. **Encrypt sensitive data** - Use lib/crypto.ts for tokens and API keys
7. **Check for existing components** - Use shadcn CLI before creating new UI components
8. **Claude API Gateway support** - Use AI_GATEWAY_API_KEY for alternative models, ANTHROPIC_API_KEY for Claude models
