import { Octokit } from '@octokit/rest'
import { getUserGitHubToken } from './user-token'

/**
 * Create an Octokit instance for the currently authenticated user
 * Falls back to GITHUB_TOKEN env var if user hasn't connected GitHub
 */
export async function getOctokit(): Promise<Octokit> {
  const userToken = await getUserGitHubToken()
  const token = userToken || process.env.GITHUB_TOKEN

  if (!token) {
    console.warn('No GitHub token available. User needs to connect GitHub or set GITHUB_TOKEN env var.')
  }

  return new Octokit({
    auth: token,
  })
}

/**
 * @deprecated Use getOctokit() instead for per-user authentication
 * Legacy client using GITHUB_TOKEN env var - kept for backwards compatibility
 */
export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})
