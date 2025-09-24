export function validateEnvironmentVariables(selectedAgent: string = 'claude') {
  const errors: string[] = []

  // Check for required environment variables based on selected agent
  if (selectedAgent === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required for Claude CLI')
  }

  if (selectedAgent === 'cursor' && !process.env.CURSOR_API_KEY) {
    errors.push('CURSOR_API_KEY is required for Cursor CLI')
  }

  if (selectedAgent === 'codex' && !process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required for Codex CLI')
  }

  // Check for GitHub token for private repositories
  if (!process.env.GITHUB_TOKEN) {
    errors.push('GITHUB_TOKEN is required for repository access')
  }

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join(', ') : undefined,
  }
}

export function createAuthenticatedRepoUrl(repoUrl: string): string {
  if (!process.env.GITHUB_TOKEN) {
    return repoUrl
  }

  try {
    const url = new URL(repoUrl)
    if (url.hostname === 'github.com') {
      // Add GitHub token for authentication
      url.username = process.env.GITHUB_TOKEN
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
