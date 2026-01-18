import 'server-only'

/**
 * GitHub Token Validation Result
 */
export interface GitHubTokenValidationResult {
  valid: boolean
  error?: string
  scopes?: string[]
  username?: string
}

/**
 * Validate a GitHub access token by testing it against the GitHub API.
 *
 * This function:
 * 1. Tests the token with GitHub API /user endpoint
 * 2. Checks if the token has required 'repo' scope
 * 3. Handles rate limiting and network errors gracefully
 *
 * @param token - The GitHub access token to validate
 * @returns Validation result with valid status, error message, and scopes
 */
export async function validateGitHubToken(token: string): Promise<GitHubTokenValidationResult> {
  try {
    // Test token with GitHub API (with 10 second timeout to prevent indefinite hangs)
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(10000),
    })

    // Check for authentication failure
    if (response.status === 401) {
      return {
        valid: false,
        error: 'GitHub token is invalid or expired. Please reconnect your GitHub account.',
      }
    }

    // Check for rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
      if (rateLimitRemaining === '0') {
        return {
          valid: false,
          error: 'GitHub API rate limit exceeded. Please try again later.',
        }
      }
      return {
        valid: false,
        error: 'GitHub API access forbidden. Please reconnect your GitHub account.',
      }
    }

    // Check for other error responses
    if (!response.ok) {
      return {
        valid: false,
        error: 'Failed to validate GitHub token. Please try again.',
      }
    }

    // Parse user data to confirm token works
    const userData = await response.json()
    if (!userData.login) {
      return {
        valid: false,
        error: 'Invalid GitHub token response. Please reconnect your GitHub account.',
      }
    }

    // Extract OAuth scopes from response header
    const scopesHeader = response.headers.get('x-oauth-scopes')
    const scopes = scopesHeader ? scopesHeader.split(',').map((s) => s.trim()) : []

    // Check for required 'repo' scope
    if (!scopes.includes('repo')) {
      return {
        valid: false,
        error: 'GitHub token missing required permissions. Please reconnect GitHub with repository access.',
        scopes,
      }
    }

    // Token is valid
    return {
      valid: true,
      scopes,
      username: userData.login,
    }
  } catch (error) {
    // Handle timeout errors
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        valid: false,
        error: 'GitHub API request timed out. Please check your connection and try again.',
      }
    }

    // Handle network errors and other exceptions
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        valid: false,
        error: 'Network error while validating GitHub token. Please check your connection.',
      }
    }

    // Generic error fallback
    return {
      valid: false,
      error: 'Failed to validate GitHub token. Please try again.',
    }
  }
}
