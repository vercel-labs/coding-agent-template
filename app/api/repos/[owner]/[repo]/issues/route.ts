import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github/client'

export async function GET(request: NextRequest, context: { params: Promise<{ owner: string; repo: string }> }) {
  try {
    const { owner, repo } = await context.params

    const octokit = await getOctokit()

    if (!octokit.auth) {
      return NextResponse.json({ error: 'GitHub authentication required' }, { status: 401 })
    }

    // Fetch issues from the repository
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 30,
    })

    // Filter out pull requests (PRs are technically issues in GitHub's API)
    const filteredIssues = issues.filter((issue) => !issue.pull_request)

    return NextResponse.json({ issues: filteredIssues })
  } catch (error) {
    console.error('Error fetching issues:', error)
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 })
  }
}
