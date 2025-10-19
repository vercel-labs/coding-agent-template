import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github/client'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string; pr_number: string }> },
) {
  try {
    const { owner, repo, pr_number } = await context.params
    const prNumber = parseInt(pr_number, 10)

    if (isNaN(prNumber)) {
      return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 })
    }

    const octokit = await getOctokit()

    if (!octokit.auth) {
      return NextResponse.json({ error: 'GitHub authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { body: commentBody } = body

    if (!commentBody || typeof commentBody !== 'string' || !commentBody.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })
    }

    // Post comment to the pull request
    const { data: comment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    })

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error posting comment:', error)
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 })
  }
}
