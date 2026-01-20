# AI Agent Guidelines

This document contains critical rules and guidelines for AI agents working on this codebase.

## Security Rules

### CRITICAL: No Dynamic Values in Logs

**All log statements MUST use static strings only. NEVER include dynamic values, regardless of severity.**

#### Bad Examples (DO NOT DO THIS):
```typescript
// BAD - Contains dynamic values
await logger.info(`Task created: ${taskId}`)
await logger.error(`Failed to process ${filename}`)
console.log(`User ${userId} logged in`)
console.error(`Error for ${provider}:`, error)
```

#### Good Examples (DO THIS):
```typescript
// GOOD - Static strings only
await logger.info('Task created')
await logger.error('Failed to process file')
console.log('User logged in')
console.error('Error occurred:', error)
```

#### Rationale:
- **Prevents data leakage**: Dynamic values in logs can expose sensitive information (user IDs, file paths, credentials, etc.) to end users
- **Security by default**: Logs are displayed directly in the UI and returned in API responses
- **No exceptions**: This applies to ALL log levels (info, error, success, command, console.log, console.error, console.warn, etc.)

#### Sensitive Data That Must NEVER Appear in Logs:
- Vercel credentials (SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID)
- User IDs and personal information
- File paths and repository URLs (including branch names)
- Branch names (especially for private repositories with naming conventions)
- Commit messages and commit SHAs
- Error details that may contain sensitive context
- External API tokens (64-character hex strings from `/api/tokens`)
- Any dynamic values that could reveal system internals

### Credential Redaction

The `redactSensitiveInfo()` function in `lib/utils/logging.ts` automatically redacts known sensitive patterns, but this is a **backup measure only**. The primary defense is to never log dynamic values in the first place.

#### Current Redaction Patterns:
- API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
- Vercel credentials (SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID)
- Bearer tokens
- JSON fields (teamId, projectId)
- Environment variables containing KEY, TOKEN, SECRET, PASSWORD, TEAM_ID, PROJECT_ID

## Code Quality Guidelines

### Code Formatting and Quality Checks

**Always run `pnpm format`, `pnpm type-check`, and `pnpm lint` after making changes to TypeScript/TSX files.**

The project uses Prettier for code formatting, TypeScript for type checking, and ESLint for linting. After editing any `.ts` or `.tsx` files, run:

```bash
pnpm format
pnpm type-check
pnpm lint
```

**If any errors are found:**
1. **Type errors**: Fix TypeScript type errors by correcting type annotations, adding missing imports, or fixing type mismatches
2. **Lint errors**: Fix ESLint errors by following the suggested fixes or adjusting the code to meet the linting rules
3. **Do not skip or ignore errors** - all errors must be resolved before considering the task complete

This ensures all code follows the project's formatting standards, type safety requirements, and linting rules, preventing issues in pull requests.

### Use shadcn CLI for UI Components

**When adding UI components, check if a shadcn/ui component exists and install it via CLI instead of writing it manually.**

```bash
pnpm dlx shadcn@latest add <component-name>
```

Existing components are in `components/ui/`. See [shadcn/ui docs](https://ui.shadcn.com/) for available components.

### CRITICAL: Never Run Dev Servers

**DO NOT run development servers (e.g., `npm run dev`, `pnpm dev`, `next dev`) as they will conflict with other running instances.**

#### Why This Rule Exists:
- Dev servers run indefinitely and block the terminal session
- Multiple instances on the same port cause conflicts
- The application may already be running in the user's environment
- Long-running processes make the conversation hang for the user

#### Commands to AVOID:
```bash
# DO NOT RUN THESE:
npm run dev
pnpm dev
next dev
npm start
pnpm start
yarn dev
node --watch
nodemon
```

#### What to Do Instead:
1. **Testing changes**: Use `pnpm build` to verify the production build works
2. **Type checking**: Use `pnpm type-check` to verify types
3. **Linting**: Use `pnpm lint` to check code quality
4. **Running tests**: Use `pnpm test` if tests are available
5. **If the user needs to test**: Let the user run the dev server themselves

#### Exception:
If the user explicitly asks you to start a dev server, politely explain why you cannot do this and suggest they run it themselves instead.

### Logging Best Practices

1. **Use descriptive static messages**
   ```typescript
   // Instead of logging the value, log the action
   await logger.info('Sandbox created successfully')
   await logger.info('Dependencies installed')
   await logger.error('Build failed')
   ```

2. **Server-side logging for debugging**
   ```typescript
   // Use console.error for server-side debugging (not shown to users)
   // But still avoid sensitive data
   console.error('Sandbox creation error:', error)
   ```

3. **Progress updates**
   ```typescript
   // Use static progress messages
   await logger.updateProgress(50, 'Installing dependencies')
   await logger.updateProgress(75, 'Running build')
   ```

### Error Handling

1. **Generic error messages to users**
   ```typescript
   await logger.error('Operation failed')
   // NOT: await logger.error(`Operation failed: ${error.message}`)
   ```

2. **Detailed server-side logging**
   ```typescript
   console.error('Detailed error for debugging:', error)
   // This appears in server logs, not user-facing logs
   ```

## Testing Changes

When making changes that involve logging:

1. **Search for dynamic values**
   ```bash
   # Check for logger statements with template literals
   grep -r "logger\.(info|error|success|command)\(\`.*\$\{" .
   
   # Check for console statements with template literals
   grep -r "console\.(log|error|warn|info)\(\`.*\$\{" .
   ```

2. **Verify no sensitive data exposure**
   - Test the feature in the UI
   - Check the logs displayed to users
   - Ensure no sensitive information is visible

## Task Execution Details

### Task Fields and Workflow

When creating a task, the following fields are supported:

- `prompt` (required) - User's coding request
- `repoUrl` (required) - GitHub repository URL
- `selectedAgent` (optional) - AI agent to use (default: 'claude')
- `selectedModel` (optional) - Specific model for the agent
- `sourceBranch` (optional) - Specific branch to clone from (defaults to repository's default branch)
- `installDependencies` (optional) - Whether to auto-install dependencies (default: false)
- `maxDuration` (optional) - Maximum sandbox duration in minutes (default: 300)
- `keepAlive` (optional) - Whether to keep sandbox alive after task completion (default: false)

#### Source Branch Handling

The `sourceBranch` field allows tasks to clone from a specific branch instead of the repository's default branch:

1. **Branch Selection**: Use `/api/github/branches` to fetch available branches
2. **Clone Process**: If `sourceBranch` is specified, git clones with `--branch <sourceBranch>`
3. **Fallback Logic**: If the specified branch doesn't exist, the sandbox automatically falls back to the repository's default branch
4. **Static Logging**: Branch names must NOT be logged dynamically (use static messages only)

**Important**: Branch names can be sensitive in private repositories and must not appear in user-facing logs.

## Configuration Security

### Environment Variables

Never expose these in logs or to the client:
- `SANDBOX_VERCEL_TOKEN` - Vercel API token
- `SANDBOX_VERCEL_TEAM_ID` - Vercel team identifier
- `SANDBOX_VERCEL_PROJECT_ID` - Vercel project identifier
- `ANTHROPIC_API_KEY` - Anthropic/Claude API key
- `OPENAI_API_KEY` - OpenAI API key
- `GEMINI_API_KEY` - Google Gemini API key
- `CURSOR_API_KEY` - Cursor agent API key
- `GH_TOKEN` / `GITHUB_TOKEN` - GitHub personal access token
- `JWE_SECRET` - Encryption secret
- `ENCRYPTION_KEY` - Encryption key
- Any user-provided API keys
- External API tokens (Bearer tokens for programmatic access)

### Client-Safe Variables

Only these variables should be exposed to the client (via `NEXT_PUBLIC_` prefix):
- `NEXT_PUBLIC_AUTH_PROVIDERS` - Available auth providers
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` - GitHub OAuth client ID (public)

## Agent Capabilities Comparison

### MCP Server Support

The following agents support Model Context Protocol (MCP) servers with different configuration formats:

- **Claude**: Full MCP support via `.mcp.json` (JSON format)
  - Stdio servers: command + args
  - HTTP servers: baseUrl + headers
  - OAuth credentials supported

- **Codex**: MCP support via `~/.codex/config.toml` (TOML format)
  - Stdlib servers: command + args
  - Bearer token support
  - Remote servers via experimental flag

- **Copilot**: MCP support via `.copilot/mcp-config.json` (JSON format)
  - Stdio servers: command + args + env
  - HTTP servers: headers
  - Tool selection via "tools": [] array

- **Cursor, Gemini, OpenCode**: No MCP support

### Agent API Key Requirements

Each agent has specific API key requirements:

- **Claude**: Dual authentication
  - Primary: `AI_GATEWAY_API_KEY` (for alternative models: Gemini, GPT-5.x, etc.)
  - Fallback: `ANTHROPIC_API_KEY` (for Claude models: claude-sonnet, claude-opus, etc.)
  - Both keys optional; error if neither available
  - Uses `lib/crypto.ts` for encryption

- **Codex**: Single required key
  - Required: `AI_GATEWAY_API_KEY` (no fallback to OPENAI_API_KEY)
  - Validates key format: must start with `sk-` (OpenAI) or `vck_` (Vercel)
  - Returns error if key format invalid
  - Default model: `openai/gpt-4o`

- **Copilot**: GitHub token required
  - Required: `GH_TOKEN` or `GITHUB_TOKEN`
  - No AI provider API key needed (uses GitHub's infrastructure)
  - User's GitHub account must be authenticated via web UI settings

- **Cursor**: API key required
  - Required: `CURSOR_API_KEY`
  - Installation method: curl-based script (not npm)
  - Stores config in `~/.cursor/` directory

- **Gemini**: Google API key required
  - Required: `GEMINI_API_KEY`
  - Installation: `npm install -g @google/gemini-cli`
  - No model validation (selectedModel parameter ignored)

- **OpenCode**: Flexible authentication
  - Required: Either `OPENAI_API_KEY` OR `ANTHROPIC_API_KEY`
  - Supports fallback between providers
  - No default model specified

### Streaming Output Behavior

Agents have different output streaming capabilities:

- **Claude**: Full streaming support
  - Outputs newline-delimited JSON events in real-time
  - Updates `taskMessages` table immediately
  - Extracts session_id from streaming JSON for resumption

- **Copilot**: Text streaming support
  - Streams text output to `taskMessages` table
  - Filters diff boxes from output
  - Real-time UI updates possible

- **Cursor**: Streaming support
  - StreamOutput parameter available
  - Real-time message accumulation
  - Slower UI responsiveness than Claude

- **Codex**: No streaming
  - Returns output only at completion
  - UI updates batched at end of execution
  - Longer wait time for user feedback

- **Gemini**: No streaming
  - Returns output at completion
  - No real-time task message updates
  - Batch output handling

- **OpenCode**: No streaming
  - Returns output only at completion
  - No real-time feedback to taskMessages table
  - Delayed UI updates

### Session Resumption Support

Session resumption allows tasks to continue from previous checkpoints:

- **Claude**: Full resumption support
  - Uses `--resume "<sessionId>"` with UUID validation
  - Fallback: `--continue` for most recent session
  - Extracted from streaming JSON output
  - Recommended for long-running tasks with keepAlive enabled

- **Codex**: Limited resumption
  - Uses `--last` flag only (no session ID parameter)
  - Resumes most recent session automatically
  - Limited granularity (can't resume specific sessions)

- **Copilot**: Optional resumption
  - Uses `--resume` flag if sessionId provided
  - May not work reliably
  - Not recommended for critical tasks

- **Cursor**: Resumption supported
  - SessionId parameter available
  - Implementation details documented in code
  - Recommended for task continuation

- **Gemini**: No resumption support
  - isResumed parameter ignored
  - No session handling code
  - Each execution is independent

- **OpenCode**: No resumption support
  - isResumed parameter present but unused
  - No session extraction or handling
  - Each execution is independent

### Default Models by Agent

Each agent has default model selections:

- **Claude**: `claude-sonnet-4-5-20250929` (claude.ts line 247)
- **Codex**: `openai/gpt-4o` (codex.ts line 150)
- **Copilot**: No default (model is optional)
- **Cursor**: No documented default
- **Gemini**: No documented default (parameter ignored)
- **OpenCode**: No documented default

### Installation Methods

Agents use different installation approaches:

- **Claude**: Pre-installed with Claude Code application
  - No additional installation needed
  - Uses local `~/.config/claude/` for configuration

- **Codex**: npm global installation
  - Command: `npm install -g @openai/codex`
  - Requires npm/Node.js in sandbox
  - Detected via `which codex`

- **Copilot**: npm global installation
  - Command: `npm install -g @github/copilot`
  - Requires npm/Node.js in sandbox
  - Detected via `which copilot`

- **Cursor**: curl-based installer
  - Command: `curl https://cursor.com/install -fsS | bash -s -- --verbose`
  - Custom installation script (not npm)
  - Installs to `~/.local/bin/cursor-agent`
  - Unique among all agents

- **Gemini**: npm global installation
  - Command: `npm install -g @google/gemini-cli`
  - Requires npm/Node.js in sandbox
  - Detected via `which gemini`

- **OpenCode**: npm global installation (implied)
  - Uses standard npm global approach
  - Requires npm/Node.js in sandbox

## API Route References

### GitHub API Routes

The following GitHub API routes are available for managing repositories and branches:

#### Repository Operations
- `GET /api/github/user` - Authenticated user profile
- `GET /api/github/user-repos` - User's repositories with pagination
- `GET /api/github/repos` - Search/filter repositories
- `POST /api/github/repos/create` - Create new repository
- `GET /api/github/verify-repo` - Verify access to specific repository
- `GET /api/github/orgs` - User's organizations
- `GET /api/github/branches` - List repository branches

#### Branch Selection Endpoint

`GET /api/github/branches?owner=<owner>&repo=<repo>`

Returns available branches for a repository, with the repository's default branch listed first:

```json
{
  "branches": [
    { "name": "main", "protected": false },
    { "name": "develop", "protected": true },
    { "name": "feature-x", "protected": false }
  ],
  "defaultBranch": "main"
}
```

**Usage**: Used for selecting a source branch when creating a task. Branch selection is currently available via MCP create-task tool (optional `sourceBranch` parameter).

## Architecture Guidelines

### Repository Page Structure

The repository page uses a nested routing structure with separate pages for each tab:

#### Route Structure
```
app/repos/[owner]/[repo]/
├── layout.tsx           # Shared layout with navigation tabs
├── page.tsx            # Redirects to /commits by default
├── commits/
│   └── page.tsx        # Commits page
├── issues/
│   └── page.tsx        # Issues page
└── pull-requests/
    └── page.tsx        # Pull Requests page
```

#### Components
- `components/repo-layout.tsx` - Shared layout component with tab navigation
- `components/repo-commits.tsx` - Commits list component
- `components/repo-issues.tsx` - Issues list component
- `components/repo-pull-requests.tsx` - Pull requests list component

#### API Routes
```
app/api/repos/[owner]/[repo]/
├── commits/route.ts         # GET - Fetch commits
├── issues/route.ts          # GET - Fetch issues
└── pull-requests/route.ts   # GET - Fetch pull requests
```

#### Key Features
1. **Tab Navigation**: Uses Next.js Link components for client-side navigation between tabs
2. **Separate Pages**: Each tab renders on its own route (commits, issues, pull-requests)
3. **Default Route**: Visiting `/repos/[owner]/[repo]` redirects to `/repos/[owner]/[repo]/commits`
4. **Active State**: The active tab is determined by matching the current pathname
5. **GitHub Integration**: All data is fetched from GitHub API using Octokit client

#### Adding New Tabs
To add a new tab to the repository page:

1. Create a new directory under `app/repos/[owner]/[repo]/[tab-name]/`
2. Add a `page.tsx` file that renders your component
3. Create the component in `components/repo-[tab-name].tsx`
4. Add an API route in `app/api/repos/[owner]/[repo]/[tab-name]/route.ts`
5. Update the `tabs` array in `components/repo-layout.tsx` to include the new tab
6. Follow the existing patterns for data fetching and error handling

## Compliance Checklist

Before submitting changes, verify:

- [ ] No template literals with `${}` in any log statements
- [ ] All logger calls use static strings
- [ ] All console calls use static strings (for user-facing logs)
- [ ] No sensitive data in error messages
- [ ] Tested in UI to confirm no data leakage
- [ ] Server-side debugging logs don't expose credentials
- [ ] Ran `pnpm format` and code is properly formatted
- [ ] Ran `pnpm format:check` to verify formatting
- [ ] Ran `pnpm type-check` and all type errors are fixed
- [ ] Ran `pnpm lint` and all linting errors are fixed
- [ ] Ran `pnpm build` to verify production build succeeds

## Questions?

If you need to log information for debugging purposes:
1. Use server-side console logs (not shown to users)
2. Still avoid logging sensitive credentials
3. Consider adding better error handling instead of logging details
4. Use generic user-facing messages

---

**Remember: When in doubt, use a static string. No exceptions.**

