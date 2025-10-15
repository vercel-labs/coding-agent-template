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
 * Get the authenticated GitHub user's information
 * Returns null if no GitHub account is connected
 */
export async function getGitHubUser(): Promise<{
  username: string
  name: string | null
  email: string | null
} | null> {
  try {
    const octokit = await getOctokit()

    if (!octokit.auth) {
      return null
    }

    const { data } = await octokit.rest.users.getAuthenticated()

    return {
      username: data.login,
      name: data.name,
      email: data.email,
    }
  } catch (error) {
    console.error('Error getting GitHub user:', error)
    return null
  }
}

/**
 * Parse a GitHub repository URL to extract owner and repo
 */
export function parseGitHubUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    // Handle both HTTPS and SSH URLs
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const match = repoUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+?)(\.git)?$/)

    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      }
    }
    return null
  } catch (error) {
    console.error('Error parsing GitHub URL:', error)
    return null
  }
}

interface CreatePullRequestParams {
  repoUrl: string
  branchName: string
  title: string
  body?: string
  baseBranch?: string
}

interface CreatePullRequestResult {
  success: boolean
  prUrl?: string
  prNumber?: number
  error?: string
}

/**
 * Create a pull request on GitHub
 */
export async function createPullRequest(params: CreatePullRequestParams): Promise<CreatePullRequestResult> {
  const { repoUrl, branchName, title, body = '', baseBranch = 'main' } = params

  try {
    const octokit = await getOctokit()

    // Check if user has connected GitHub
    if (!octokit.auth) {
      return {
        success: false,
        error: 'GitHub account not connected',
      }
    }

    // Parse repository URL
    const parsed = parseGitHubUrl(repoUrl)
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid GitHub repository URL',
      }
    }

    const { owner, repo } = parsed

    // Create the pull request
    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: branchName,
      base: baseBranch,
    })

    return {
      success: true,
      prUrl: response.data.html_url,
      prNumber: response.data.number,
    }
  } catch (error: unknown) {
    console.error('Error creating pull request:', error)

    // Handle specific error cases
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status
      if (status === 422) {
        return {
          success: false,
          error: 'Pull request already exists or branch does not exist',
        }
      }
      if (status === 403) {
        return {
          success: false,
          error: 'Permission denied. Check repository access',
        }
      }
      if (status === 404) {
        return {
          success: false,
          error: 'Repository not found or no access',
        }
      }
    }

    return {
      success: false,
      error: 'Failed to create pull request',
    }
  }
}

interface MergePullRequestParams {
  repoUrl: string
  prNumber: number
  commitTitle?: string
  commitMessage?: string
  mergeMethod?: 'merge' | 'squash' | 'rebase'
}

interface MergePullRequestResult {
  success: boolean
  merged?: boolean
  message?: string
  sha?: string
  error?: string
}

interface GetPullRequestStatusParams {
  repoUrl: string
  prNumber: number
}

interface GetPullRequestStatusResult {
  success: boolean
  status?: 'open' | 'closed' | 'merged'
  mergeCommitSha?: string
  error?: string
}

/**
 * Merge a pull request on GitHub
 */
export async function mergePullRequest(params: MergePullRequestParams): Promise<MergePullRequestResult> {
  const { repoUrl, prNumber, commitTitle, commitMessage, mergeMethod = 'squash' } = params

  try {
    const octokit = await getOctokit()

    // Check if user has connected GitHub
    if (!octokit.auth) {
      return {
        success: false,
        error: 'GitHub account not connected',
      }
    }

    // Parse repository URL
    const parsed = parseGitHubUrl(repoUrl)
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid GitHub repository URL',
      }
    }

    const { owner, repo } = parsed

    // Merge the pull request
    const response = await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      commit_title: commitTitle,
      commit_message: commitMessage,
      merge_method: mergeMethod,
    })

    return {
      success: true,
      merged: response.data.merged,
      message: response.data.message,
      sha: response.data.sha,
    }
  } catch (error: unknown) {
    console.error('Error merging pull request:', error)

    // Handle specific error cases
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status
      if (status === 405) {
        return {
          success: false,
          error: 'Pull request is not mergeable',
        }
      }
      if (status === 409) {
        return {
          success: false,
          error: 'Merge conflict - cannot auto-merge',
        }
      }
      if (status === 403) {
        return {
          success: false,
          error: 'Permission denied. Check repository access',
        }
      }
      if (status === 404) {
        return {
          success: false,
          error: 'Pull request not found',
        }
      }
    }

    return {
      success: false,
      error: 'Failed to merge pull request',
    }
  }
}

/**
 * Get the current status of a pull request from GitHub
 */
export async function getPullRequestStatus(params: GetPullRequestStatusParams): Promise<GetPullRequestStatusResult> {
  const { repoUrl, prNumber } = params

  try {
    const octokit = await getOctokit()

    // Check if user has connected GitHub
    if (!octokit.auth) {
      return {
        success: false,
        error: 'GitHub account not connected',
      }
    }

    // Parse repository URL
    const parsed = parseGitHubUrl(repoUrl)
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid GitHub repository URL',
      }
    }

    const { owner, repo } = parsed

    // Get the pull request
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    })

    // Determine status based on state and merged_at
    let status: 'open' | 'closed' | 'merged'
    if (response.data.merged_at) {
      status = 'merged'
    } else if (response.data.state === 'closed') {
      status = 'closed'
    } else {
      status = 'open'
    }

    return {
      success: true,
      status,
      mergeCommitSha: response.data.merge_commit_sha || undefined,
    }
  } catch (error: unknown) {
    console.error('Error getting pull request status:', error)

    // Handle specific error cases
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status
      if (status === 404) {
        return {
          success: false,
          error: 'Pull request not found',
        }
      }
      if (status === 403) {
        return {
          success: false,
          error: 'Permission denied. Check repository access',
        }
      }
    }

    return {
      success: false,
      error: 'Failed to get pull request status',
    }
  }
}
