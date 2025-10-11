# Coding Agent Template

A template for building AI-powered coding agents that supports Claude Code, OpenAI's Codex CLI, Cursor CLI, Google Gemini CLI, and opencode with **multiple sandbox providers** (Vercel, Docker, E2B, Daytona) and **multiple orchestrators** (Inngest, Agentuity) to automatically execute coding tasks on your repositories.

![Coding Agent Template Screenshot](screenshot.png)

## Deploy Your Own

You can deploy your own version of the coding agent template to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](<https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fcoding-agent-template&env=POSTGRES_URL,ANTHROPIC_API_KEY,GITHUB_TOKEN,VERCEL_TEAM_ID,VERCEL_PROJECT_ID,VERCEL_TOKEN,AI_GATEWAY_API_KEY&envDescription=Required+environment+variables+for+the+coding+agent+template.+Optional+variables+(CURSOR_API_KEY+for+Cursor+agent,+NPM_TOKEN+for+private+packages)+can+be+added+later+in+your+Vercel+project+settings.&project-name=coding-agent-template&repository-name=coding-agent-template>)

## Features

- **Multi-Agent Support**: Choose from Claude Code, OpenAI Codex CLI, Cursor CLI, Google Gemini CLI, or opencode to execute coding tasks
- **Multiple Sandbox Providers**:
  - **Vercel** - Cloud sandboxes with full git integration
  - **Docker** - Local containerized execution
  - **E2B** - Cloud code interpreter sandboxes
  - **Daytona** - Fast cloud sandboxes with native Git API (sub-90ms creation)
- **AI Gateway Integration**: Built for seamless integration with [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for model routing and observability
- **AI-Generated Branch Names**: Automatically generates descriptive Git branch names using AI SDK 5 + AI Gateway
- **Multiple Orchestrators**:
  - **Inngest** - Step-based workflow orchestration with local dev dashboard
  - **Agentuity** - Cloud-native agent platform with built-in storage and streaming
- **Task Management**: Track task progress with real-time updates
- **Persistent Storage**: Tasks stored in Postgres database
- **Git Integration**: Automatically creates branches and commits changes
- **Modern UI**: Clean, responsive interface built with Next.js and Tailwind CSS
- **MCP Server Support**: Connect MCP servers to Claude Code for extended capabilities (Claude only)

## Sandbox Providers

| Provider    | Location | Speed        | Git API    | Best For                     |
| ----------- | -------- | ------------ | ---------- | ---------------------------- |
| **Vercel**  | Cloud    | Medium       | Shell      | Production deployments       |
| **Docker**  | Local    | Fast         | Shell      | Local development & testing  |
| **E2B**     | Cloud    | Medium       | Shell      | Code interpretation tasks    |
| **Daytona** | Cloud    | **Sub-90ms** | **Native** | Fast iteration & development |

## Orchestrators

| Orchestrator  | Type                | Local Dev          | Best For                                     |
| ------------- | ------------------- | ------------------ | -------------------------------------------- |
| **Inngest**   | Step-based workflow | Dashboard at :8288 | Complex multi-step tasks with retries        |
| **Agentuity** | Agent platform      | `agentuity dev`    | Cloud-native agents with storage & streaming |

Both orchestrators use the same sandbox providers and task execution logic.

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/vercel-labs/coding-agent-template.git
cd coding-agent-template
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

Create a `.env.local` file with your values:

#### Core Configuration:

- `POSTGRES_URL`: Your PostgreSQL connection string (works with any PostgreSQL database)
- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude
- `GITHUB_TOKEN`: GitHub personal access token (for repository access)
- `AI_GATEWAY_API_KEY`: Your AI Gateway API key for AI-generated branch names and Codex agent support
- `ORCHESTRATOR`: Choose `inngest` (default) or `agentuity`

#### Sandbox provider keys (choose one or more):

- **Vercel Sandbox** (Cloud):
  - `VERCEL_TEAM_ID`: Your Vercel team ID
  - `VERCEL_PROJECT_ID`: Your Vercel project ID
  - `VERCEL_TOKEN`: Your Vercel API token

- **Docker** (Local):
  - `CLAUDE_CODE_OAUTH_TOKEN`: Claude CLI authentication token
  - Requires Docker Desktop installed and running

- **E2B** (Cloud):
  - `E2B_API_KEY`: Your E2B API key ([get one here](https://e2b.dev/dashboard))

- **Daytona** (Cloud):
  - `DAYTONA_API_KEY`: Your Daytona API key ([get one here](https://app.daytona.io/dashboard/keys))

#### Orchestrator keys (based on your choice):

- **Inngest** (default):
  - Automatically configured for local dev
  - No additional keys needed

- **Agentuity**:
  - `AGENTUITY_API_KEY`: Your Agentuity API key
  - `AGENTUITY_AGENT_URL`: Agent URL (default: `http://localhost:3001` for local dev)

#### Optional environment variables:

- `CURSOR_API_KEY`: For Cursor agent support
- `GEMINI_API_KEY`: For Google Gemini agent support
- `NPM_TOKEN`: For private npm packages
- `ENCRYPTION_KEY`: 32-byte hex string for encrypting MCP OAuth secrets (required only when using MCP connectors). Generate with: `openssl rand -hex 32`

### 4. Set up the database

Generate and run database migrations:

```bash
pnpm db:generate
pnpm db:push
```

### 5. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Create a Task**: Enter a repository URL and describe what you want the AI to do
2. **Choose Sandbox**: Select your preferred sandbox provider (Vercel, Docker, E2B, or Daytona)
3. **Select Agent**: Pick which AI agent to use (Claude Code, Codex, Cursor, Gemini, or opencode)
4. **Monitor Progress**: Watch real-time logs as the agent works
5. **Review Results**: See the changes made and the branch created
6. **Manage Tasks**: View all your tasks in the sidebar with status updates

## How It Works

1. **Task Creation**: When you submit a task, it's stored in the database and queued via Inngest
2. **AI Branch Name Generation**: AI SDK 5 + AI Gateway automatically generates a descriptive branch name based on your task (non-blocking using Next.js 15's `after()`)
3. **Sandbox Setup**: Your chosen sandbox provider creates an isolated environment with your repository
4. **Agent Execution**: Your selected coding agent (Claude Code, Codex CLI, Cursor CLI, Gemini CLI, or opencode) analyzes your prompt and makes changes
5. **Git Operations**: Changes are committed to the AI-generated branch
6. **Cleanup**: The sandbox is shut down to free resources

## Architecture

### Task Orchestration

Tasks are orchestrated using [Inngest](https://www.inngest.com/) which provides:

- Reliable execution with automatic retries
- Step-based workflow for complex operations
- Built-in observability at `http://localhost:8288`
- Graceful handling of long-running operations

### Sandbox Provider Architecture

The application uses a provider pattern for sandbox management:

```typescript
interface SandboxProvider {
  create(config: SandboxConfig): Promise<SandboxResult>
  executeAgent(sandbox: SandboxInstance, instruction: string): Promise<ExecutionResult>
  destroy(sandbox: SandboxInstance): Promise<void>
}
```

Each provider implements:

- **Sandbox creation** with repository cloning
- **Agent CLI installation** (Claude, Codex, Cursor, etc.)
- **Command execution** with proper timeout handling
- **Sandbox reconnection** after Inngest serialization
- **Cleanup and resource management**

## Environment Variables Reference

### Core Application

- `POSTGRES_URL`: PostgreSQL connection string
- `ANTHROPIC_API_KEY`: Claude API key
- `GITHUB_TOKEN`: GitHub token for repository access
- `AI_GATEWAY_API_KEY`: AI Gateway API key for branch name generation

### Sandbox Providers

#### Vercel Sandbox

- `VERCEL_TEAM_ID`: Vercel team ID
- `VERCEL_PROJECT_ID`: Vercel project ID
- `VERCEL_TOKEN`: Vercel API token

#### Docker (Local)

- `CLAUDE_CODE_OAUTH_TOKEN`: Claude CLI OAuth token

#### E2B (Cloud)

- `E2B_API_KEY`: E2B API key

#### Daytona (Cloud)

- `DAYTONA_API_KEY`: Daytona API key

### Optional

- `CURSOR_API_KEY`: Cursor agent API key
- `GEMINI_API_KEY`: Google Gemini agent API key ([get one here](https://aistudio.google.com/apikey))
- `NPM_TOKEN`: NPM token for private packages
- `ENCRYPTION_KEY`: 32-byte hex for MCP OAuth encryption (generate: `openssl rand -hex 32`)

## AI Branch Name Generation

The system automatically generates descriptive Git branch names using AI SDK 5 and Vercel AI Gateway. This feature:

- **Non-blocking**: Uses Next.js 15's `after()` function to generate names without delaying task creation
- **Descriptive**: Creates meaningful branch names like `feature/user-authentication-A1b2C3` or `fix/memory-leak-parser-X9y8Z7`
- **Conflict-free**: Adds a 6-character alphanumeric hash to prevent naming conflicts
- **Fallback**: Gracefully falls back to timestamp-based names if AI generation fails
- **Context-aware**: Uses task description, repository name, and agent context for better names

### Branch Name Examples

- `feature/add-user-auth-K3mP9n` (for "Add user authentication with JWT")
- `fix/resolve-memory-leak-B7xQ2w` (for "Fix memory leak in image processing")
- `chore/update-deps-M4nR8s` (for "Update all project dependencies")
- `docs/api-endpoints-F9tL5v` (for "Document REST API endpoints")

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **Task Orchestration**: Inngest
- **AI SDK**: AI SDK 5 with Vercel AI Gateway integration
- **AI Agents**: Claude Code, OpenAI Codex CLI, Cursor CLI, Google Gemini CLI, opencode
- **Sandbox Providers**:
  - [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
  - Docker
  - [E2B](https://e2b.dev/)
  - [Daytona](https://www.daytona.io/)
- **Git**: Automated branching and commits with AI-generated branch names

## MCP Server Support

Connect MCP Servers to extend Claude Code with additional tools and integrations. **Currently only works with Claude Code agent.**

### How to Add MCP Servers

1. Go to the "Connectors" tab and click "Add MCP Server"
2. Enter server details (name, base URL, optional OAuth credentials)
3. If using OAuth, generate encryption key: `openssl rand -hex 32`
4. Add to `.env.local`: `ENCRYPTION_KEY=your-32-byte-hex-key`

**Note**: `ENCRYPTION_KEY` is only required when using MCP servers with OAuth authentication.

### Supported MCP Servers

- Context7 - Code context and understanding
- Browserbase - Browser automation
- Hugging Face - AI model integration
- And any custom MCP server following the [MCP specification](https://modelcontextprotocol.io/)

## Development

### Database Operations

```bash
# Generate migrations
pnpm db:generate

# Push schema changes
pnpm db:push

# Open Drizzle Studio
pnpm db:studio
```

### Running the App

```bash
# Development (includes Inngest dev server)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Inngest Dashboard

Access the Inngest development dashboard at `http://localhost:8288` to:

- Monitor function executions
- View step-by-step execution details
- Debug failed tasks
- Replay function runs

## Troubleshooting

### Docker Provider Issues

If Docker sandbox fails:

1. Ensure Docker Desktop is running
2. Check Docker has sufficient resources allocated
3. Verify `CLAUDE_CODE_OAUTH_TOKEN` is set correctly

### E2B/Daytona Timeout Errors

If cloud sandboxes timeout:

1. Default timeout is 30 minutes for agent execution
2. Check your API key is valid
3. Verify network connectivity

### Inngest Not Running

If tasks aren't executing:

1. Ensure `pnpm dev` is running (starts Inngest dev server)
2. Check Inngest dashboard at `http://localhost:8288`
3. Verify database connection is working

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with at least one sandbox provider
5. Submit a pull request

## Security Considerations

- **Environment Variables**: Never commit `.env` files to version control. All sensitive data should be stored in environment variables.
- **API Keys**: Rotate your API keys regularly and use the principle of least privilege.
- **Database Access**: Ensure your PostgreSQL database is properly secured with strong credentials.
- **Sandboxes**: All sandbox providers run in isolated environments, but ensure you're not exposing sensitive data in logs or outputs.
- **GitHub Token**: Use a personal access token with minimal required permissions for repository access.
- **MCP OAuth Secrets**: If using MCP servers with OAuth, ensure `ENCRYPTION_KEY` is securely stored and never committed to version control.

## License

MIT

## Acknowledgments

- [Vercel](https://vercel.com/) for Vercel Sandbox and AI Gateway
- [Anthropic](https://anthropic.com/) for Claude Code
- [E2B](https://e2b.dev/) for cloud code interpreter sandboxes
- [Daytona](https://www.daytona.io/) for fast cloud sandboxes with native Git API
- [Inngest](https://www.inngest.com/) for reliable task orchestration
