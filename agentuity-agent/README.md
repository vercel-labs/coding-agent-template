# Coding Task Executor - Agentuity Agent

This is an Agentuity agent that executes coding tasks using AI agents in isolated sandboxes.

## Setup

### 1. Install Dependencies

```bash
cd agentuity-agent
pnpm install
```

### 2. Configure Environment

Add to your `.env.local` in the root project:

```bash
# Orchestrator selection
ORCHESTRATOR=agentuity  # or 'inngest'

# Agentuity Configuration
AGENTUITY_API_KEY=your_api_key_here
AGENTUITY_AGENT_URL=http://localhost:3001  # For local dev
```

### 3. Run Locally

```bash
# In the agentuity-agent directory
pnpm dev

# This starts the agent on http://localhost:3001
```

### 4. Deploy to Agentuity Cloud

```bash
# Login to Agentuity
agentuity login

# Deploy the agent
pnpm deploy
```

## How It Works

1. **Task Submission**: The Next.js API route sends task parameters to this agent
2. **Stream Creation**: Agent creates a log stream for real-time output
3. **Background Execution**: Task executes in background using `context.waitUntil()`
4. **Core Logic**: Uses the same `executeTaskCore()` as Inngest orchestrator
5. **Sandbox Providers**: Supports all sandbox providers (Vercel, Docker, E2B, Daytona)
6. **Results Storage**: Stores results in Agentuity KV storage

## Agent Endpoints

- **POST /** - Submit a new task for execution
  - Request body: `TaskExecutionParams`
  - Response: `{ taskId, status, logsUrl }`

## Development vs Production

### Local Development

```bash
# Terminal 1: Run Next.js app
pnpm dev

# Terminal 2: Run Agentuity agent
cd agentuity-agent && pnpm dev
```

### Production

```bash
# Deploy agent to Agentuity cloud
cd agentuity-agent && pnpm deploy

# Update .env.local with deployed agent URL
AGENTUITY_AGENT_URL=https://your-agent.agentuity.cloud
```

## Monitoring

- **Logs**: View real-time logs in Agentuity dashboard
- **Streams**: Access log streams via the returned `logsUrl`
- **KV Storage**: Check task results in Agentuity KV store

## Differences from Inngest

| Feature        | Inngest                      | Agentuity                            |
| -------------- | ---------------------------- | ------------------------------------ |
| **Execution**  | Step-based with retries      | Single handler with background tasks |
| **State**      | Auto-persisted between steps | Manual via KV/Object storage         |
| **Logs**       | Inngest dashboard            | Stream API + Agentuity dashboard     |
| **Local Dev**  | `pnpm dev` (port 8288)       | `agentuity dev` (port 3001)          |
| **Production** | Inngest Cloud                | Agentuity Cloud                      |

## Troubleshooting

### Agent not starting locally

```bash
# Check if port 3001 is available
lsof -i :3001

# Try a different port
PORT=3002 agentuity dev
```

### Task execution fails

- Check agent logs in Agentuity dashboard
- Verify environment variables are set
- Ensure all dependencies are installed
- Check stream logs via the returned `logsUrl`
