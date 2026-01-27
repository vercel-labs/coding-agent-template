import 'server-only'
import { LRUCache } from 'lru-cache'

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
 * LRU cache for GitHub token validation results.
 * Caches successful validations for 5 minutes to reduce GitHub API calls.
 * Key: SHA256 hash of token (for security - don't store raw tokens in cache)
 * Value: Validation result with scopes and username
 */
const tokenValidationCache = new LRUCache<string, GitHubTokenValidationResult>({
  max: 100, // Maximum 100 cached validations
  ttl: 5 * 60 * 1000, // 5 minutes TTL
})

/**
 * Hash a token for use as cache key (avoids storing raw tokens in memory)
 */
async function hashToken(token: string): Promise<string> {
  // Use Web Crypto API for SHA-256 hashing
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Validate a GitHub access token by testing it against the GitHub API.
 *
 * This function:
 * 1. Checks LRU cache for recent validation (5-minute TTL)
 * 2. Tests the token with GitHub API /user endpoint
 * 3. Checks if the token has required 'repo' scope
 * 4. Handles rate limiting and network errors gracefully
 * 5. Caches successful validations for 5 minutes
 *
 * @param token - The GitHub access token to validate
 * @returns Validation result with valid status, error message, and scopes
 */
export async function validateGitHubToken(token: string): Promise<GitHubTokenValidationResult> {
  try {
    // Check cache first (5-minute TTL for successful validations)
    const cacheKey = await hashToken(token)
    const cachedResult = tokenValidationCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }
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

    // Token is valid - cache the result for 5 minutes
    const validResult = {
      valid: true,
      scopes,
      username: userData.login,
    }
    tokenValidationCache.set(cacheKey, validResult)
    return validResult
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
