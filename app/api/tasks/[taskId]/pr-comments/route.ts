import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOctokit } from '@/lib/github/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get the task and verify it belongs to the user
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    // Check if task has a PR
    if (!task.prNumber || !task.repoUrl) {
      return NextResponse.json({ success: false, error: 'Task does not have a PR' }, { status: 400 })
    }

    // Extract owner and repo from repoUrl
    const repoMatch = task.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!repoMatch) {
      return NextResponse.json({ success: false, error: 'Invalid repository URL' }, { status: 400 })
    }

    const [, owner, repo] = repoMatch

    // Get GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json({ success: false, error: 'GitHub authentication required' }, { status: 401 })
    }

    // Fetch both issue comments and review comments from GitHub
    const [issueCommentsResponse, reviewCommentsResponse] = await Promise.all([
      octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: task.prNumber,
      }),
      octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: task.prNumber,
      }),
    ])

    // Combine and format both types of comments
    const allComments = [
      ...issueCommentsResponse.data.map((comment) => ({
        id: comment.id,
        user: {
          login: comment.user?.login || 'unknown',
          avatar_url: comment.user?.avatar_url || '',
        },
        body: comment.body || '',
        created_at: comment.created_at,
        html_url: comment.html_url,
      })),
      ...reviewCommentsResponse.data.map((comment) => ({
        id: comment.id,
        user: {
          login: comment.user?.login || 'unknown',
          avatar_url: comment.user?.avatar_url || '',
        },
        body: comment.body || '',
        created_at: comment.created_at,
        html_url: comment.html_url,
      })),
    ]

    // Sort by created_at date (oldest first)
    allComments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    return NextResponse.json({
      success: true,
      comments: allComments,
    })
  } catch (error) {
    console.error('Error fetching PR comments:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch PR comments' }, { status: 500 })
  }
}
