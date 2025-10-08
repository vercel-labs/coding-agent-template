# Quick Start Guide

Get up and running with the Coding Agent Template in 5 minutes.

## Prerequisites

- Node.js 18+ and pnpm installed
- A GitHub account with a personal access token
- At least one sandbox provider account (choose based on your needs)

## 1. Choose Your Sandbox Provider

Pick the provider that best fits your use case:

### For Production

**Vercel Sandbox** - Fully managed cloud solution

- Sign up at [vercel.com](https://vercel.com)
- Get your Team ID, Project ID, and API Token

### For Local Development (Free!)

**Docker** - No cloud costs, runs locally

- Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
- Get Claude Code OAuth token from your Anthropic account

### For Fast Cloud Execution

**Daytona** - Sub-90ms sandbox creation with native Git API

- Sign up at [daytona.io](https://www.daytona.io)
- Get API key from [dashboard](https://app.daytona.io/dashboard/keys)

### For Code Interpretation

**E2B** - Optimized for running AI-generated code

- Sign up at [e2b.dev](https://e2b.dev)
- Get API key from [dashboard](https://e2b.dev/dashboard)

## 2. Install

```bash
git clone https://github.com/vercel-labs/coding-agent-template.git
cd coding-agent-template
pnpm install
```

## 3. Set Up Environment Variables

Create `.env.local` with the following:

### Core (Required for All)

```bash
# Database (get free tier at neon.tech)
POSTGRES_URL=postgresql://user:password@host/database

# Claude API
ANTHROPIC_API_KEY=sk-ant-your-key

# GitHub (for repo access)
GITHUB_TOKEN=ghp_your_token

# AI Gateway (for branch names)
AI_GATEWAY_API_KEY=your-gateway-key
```

### Add Your Chosen Provider

#### Option 1: Vercel (Cloud)

```bash
VERCEL_TEAM_ID=team_xxx
VERCEL_PROJECT_ID=prj_xxx
VERCEL_TOKEN=xxx
```

#### Option 2: Docker (Local)

```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-your-token
```

#### Option 3: Daytona (Cloud)

```bash
DAYTONA_API_KEY=dtn_your_key
```

#### Option 4: E2B (Cloud)

```bash
E2B_API_KEY=e2b_your_key
```

## 4. Set Up Database

```bash
pnpm db:generate
pnpm db:push
```

## 5. Start the App

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## 6. Create Your First Task

1. Click **"New Task"**
2. Enter a repository URL (e.g., `https://github.com/your-username/your-repo`)
3. Choose your sandbox provider
4. Select an agent (Claude Code recommended)
5. Enter a prompt: `"Add a comment to the README explaining what this project does"`
6. Click **"Start Task"**
7. Watch the logs in real-time!

## Next Steps

### Monitor Tasks

- View the **Inngest Dashboard** at `http://localhost:8288`
- Check task execution details and debug if needed

### Try Different Agents

- **Claude Code** - Best for complex code changes
- **Cursor** - Great for iterative development
- **Gemini** - Good for documentation tasks
- **Codex/OpenCode** - Alternative options

### Add MCP Servers (Claude Only)

1. Go to **Connectors** tab
2. Click **"Add MCP Server"**
3. Configure your MCP server details
4. Use extended capabilities in Claude Code tasks

### Production Deployment

See [README.md](README.md) for deploying to Vercel with one click.

## Troubleshooting

### "Database connection failed"

- Check your `POSTGRES_URL` is correct
- Ensure database exists and is accessible

### "Docker sandbox failed to create"

- Ensure Docker Desktop is running
- Check Docker has sufficient resources (4GB+ RAM recommended)

### "Vercel sandbox creation failed"

- Verify all three Vercel env vars are set
- Check you have access to the team/project

### "Task stuck in pending"

- Ensure `pnpm dev` is running (starts Inngest)
- Check Inngest dashboard at `http://localhost:8288`

### "Agent execution timeout"

- Default timeout is 30 minutes
- For longer tasks, this is expected behavior

## Getting Help

- **Documentation**: See [README.md](README.md) and [SANDBOX_PROVIDERS.md](SANDBOX_PROVIDERS.md)
- **Issues**: [GitHub Issues](https://github.com/vercel-labs/coding-agent-template/issues)
- **Community**: Join the [Vercel Discord](https://vercel.com/discord)

## What's Next?

- Read the full [Sandbox Provider Guide](SANDBOX_PROVIDERS.md)
- Learn about [Inngest orchestration](https://www.inngest.com/docs)
- Explore [MCP Server integration](https://modelcontextprotocol.io/)
- Try different coding agents and compare results!

---

**Tip**: Start with Docker for local development (free!) or Daytona for cloud (fastest). Both are quick to set up!
