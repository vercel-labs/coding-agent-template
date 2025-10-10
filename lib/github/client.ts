import { Octokit } from '@octokit/rest'

if (!process.env.GITHUB_TOKEN) {
  console.warn('GITHUB_TOKEN environment variable is not set. GitHub API calls will be unauthenticated.')
}

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

