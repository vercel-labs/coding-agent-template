export function validateEnvironmentVariables(
  selectedAgent: string = 'claude',
  githubToken?: string | null,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
) {
  const errors: string[] = []

  // Check for required environment variables based on selected agent
  if (selectedAgent === 'claude' && !apiKeys?.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required for Claude CLI. Please add your API key in your profile.')
  }

  if (selectedAgent === 'cursor' && !apiKeys?.CURSOR_API_KEY && !process.env.CURSOR_API_KEY) {
    errors.push('CURSOR_API_KEY is required for Cursor CLI. Please add your API key in your profile.')
  }

  if (selectedAgent === 'codex' && !apiKeys?.AI_GATEWAY_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
    errors.push('AI_GATEWAY_API_KEY is required for Codex CLI. Please add your API key in your profile.')
  }

  if (selectedAgent === 'gemini' && !apiKeys?.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    errors.push('GEMINI_API_KEY is required for Gemini CLI. Please add your API key in your profile.')
  }

  if (selectedAgent === 'opencode') {
    // OpenCode can use either AI Gateway (for GPT models) or Anthropic (for Claude models)
    // We require at least one to be present
    const hasAiGateway = apiKeys?.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY
    const hasAnthropic = apiKeys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY

    if (!hasAiGateway && !hasAnthropic) {
      errors.push(
        'Either AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY is required for OpenCode CLI. Please add at least one API key in your profile.',
      )
    }
  }

  // Check for GitHub token for private repositories
  // Use user's token if provided
  if (!githubToken) {
    errors.push('GitHub is required for repository access. Please connect your GitHub account.')
  }

  // Check for Vercel sandbox environment variables
  if (!process.env.SANDBOX_VERCEL_TEAM_ID) {
    errors.push('SANDBOX_VERCEL_TEAM_ID is required for sandbox creation')
  }

  if (!process.env.SANDBOX_VERCEL_PROJECT_ID) {
    errors.push('SANDBOX_VERCEL_PROJECT_ID is required for sandbox creation')
  }

  if (!process.env.SANDBOX_VERCEL_TOKEN) {
    errors.push('SANDBOX_VERCEL_TOKEN is required for sandbox creation')
  }

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join(', ') : undefined,
  }
}

export function createAuthenticatedRepoUrl(repoUrl: string, githubToken?: string | null): string {
  if (!githubToken) {
    return repoUrl
  }

  try {
    const url = new URL(repoUrl)
    if (url.hostname === 'github.com') {
      // Add GitHub token for authentication
      url.username = githubToken
      url.password = 'x-oauth-basic'
    }
    return url.toString()
  } catch {
    // Failed to parse repository URL
    return repoUrl
  }
}

export function createSandboxConfiguration(config: {
  repoUrl: string
  timeout?: string
  ports?: number[]
  runtime?: string
  resources?: { vcpus?: number }
  branchName?: string
}) {
  return {
    template: 'node',
    git: {
      url: config.repoUrl,
      branch: config.branchName || 'main',
    },
    timeout: config.timeout || '20m',
    ports: config.ports || [3000],
    runtime: config.runtime || 'node22',
    resources: config.resources || { vcpus: 4 },
  }
}
