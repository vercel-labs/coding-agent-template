import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github/client'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string; pr_number: string }> },
) {
  try {
    const { owner, repo, pr_number } = await context.params
    const prNumber = parseInt(pr_number, 10)

    if (isNaN(prNumber)) {
      return NextResponse.json({ error: 'Invalid pull request number' }, { status: 400 })
    }

    const octokit = await getOctokit()

    if (!octokit.auth) {
      return NextResponse.json({ error: 'GitHub authentication required' }, { status: 401 })
    }

    // Close the pull request
    const { data: pullRequest } = await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    })

    return NextResponse.json({ pullRequest })
  } catch (error) {
    console.error('Error closing pull request:', error)
    return NextResponse.json({ error: 'Failed to close pull request' }, { status: 500 })
  }
}
