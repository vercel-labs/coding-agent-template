import { Octokit } from '@octokit/rest'
import { getUserGitHubToken } from './user-token'

/**
 * Create an Octokit instance for the currently authenticated user
 * Returns an Octokit instance with the user's GitHub token if connected, otherwise without authentication
 * Calling code should check octokit.auth to verify user has connected GitHub
 */
export async function getOctokit(): Promise<Octokit> {
  const userToken = await getUserGitHubToken()

  if (!userToken) {
    console.warn('No user GitHub token available. User needs to connect their GitHub account.')
  }

  return new Octokit({
    auth: userToken || undefined,
  })
}

/**
 * @deprecated Use getOctokit() instead for per-user authentication
 * Legacy client using GITHUB_TOKEN env var - kept for backwards compatibility
 */
export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})
