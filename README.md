# Coding Agent Template

A template for building AI-powered coding agents that supports Claude Code, OpenAI's Codex CLI, Cursor CLI, and opencode with [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) to automatically execute coding tasks on your repositories.

## Deploy Your Own

You can deploy your own version of the coding agent template to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fcoding-agent-template&env=POSTGRES_URL,ANTHROPIC_API_KEY,GITHUB_TOKEN,VERCEL_TEAM_ID,VERCEL_PROJECT_ID,VERCEL_TOKEN&envDescription=Required+environment+variables+for+the+coding+agent+template&project-name=coding-agent-template&repository-name=coding-agent-template)

## Features

- **Multi-Agent Support**: Choose from Claude Code, OpenAI Codex CLI, Cursor CLI, or opencode to execute coding tasks
- **Vercel Sandbox**: Runs code in isolated, secure sandboxes ([docs](https://vercel.com/docs/vercel-sandbox))
- **AI Gateway Integration**: Built for seamless integration with [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for model routing and observability
- **Task Management**: Track task progress with real-time updates
- **Persistent Storage**: Tasks stored in Neon Postgres database
- **Git Integration**: Automatically creates branches and commits changes
- **Modern UI**: Clean, responsive interface built with Next.js and Tailwind CSS

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

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Required environment variables:

- `POSTGRES_URL`: Your PostgreSQL connection string (works with any PostgreSQL database)
- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude
- `GITHUB_TOKEN`: GitHub personal access token (for repository access)
- `VERCEL_TEAM_ID`: Your Vercel team ID
- `VERCEL_PROJECT_ID`: Your Vercel project ID
- `VERCEL_TOKEN`: Your Vercel API token

Optional environment variables:

- `CURSOR_API_KEY`: For Cursor agent support
- `OPENAI_API_KEY`: For Codex agent support
- `NPM_TOKEN`: For private npm packages

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
2. **Monitor Progress**: Watch real-time logs as the agent works
3. **Review Results**: See the changes made and the branch created
4. **Manage Tasks**: View all your tasks in the sidebar with status updates

## How It Works

1. **Task Creation**: When you submit a task, it's stored in the database
2. **Sandbox Setup**: A Vercel sandbox is created with your repository
3. **Agent Execution**: Your chosen coding agent (Claude Code, Codex CLI, Cursor CLI, or opencode) analyzes your prompt and makes changes
4. **Git Operations**: Changes are committed and pushed to a new branch
5. **Cleanup**: The sandbox is shut down to free resources

## Environment Variables

### Required

- `POSTGRES_URL`: PostgreSQL connection string
- `ANTHROPIC_API_KEY`: Claude API key
- `GITHUB_TOKEN`: GitHub token for repository access
- `VERCEL_TEAM_ID`: Vercel team ID for sandbox creation
- `VERCEL_PROJECT_ID`: Vercel project ID for sandbox creation
- `VERCEL_TOKEN`: Vercel API token for sandbox creation

### Optional

- `CURSOR_API_KEY`: Cursor agent API key
- `OPENAI_API_KEY`: OpenAI API key for Codex
- `NPM_TOKEN`: NPM token for private packages

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **AI Agents**: Claude Code, OpenAI Codex CLI, Cursor CLI, opencode
- **Sandbox**: [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
- **Git**: Automated branching and commits

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
# Development
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Security Considerations

- **Environment Variables**: Never commit `.env` files to version control. All sensitive data should be stored in environment variables.
- **API Keys**: Rotate your API keys regularly and use the principle of least privilege.
- **Database Access**: Ensure your PostgreSQL database is properly secured with strong credentials.
- **Vercel Sandbox**: Sandboxes are isolated but ensure you're not exposing sensitive data in logs or outputs.
- **GitHub Token**: Use a personal access token with minimal required permissions for repository access.
