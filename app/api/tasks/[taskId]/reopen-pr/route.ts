import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOctokit, parseGitHubUrl } from '@/lib/github/client'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get task from database and verify ownership (exclude soft-deleted)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.repoUrl || !task.prNumber) {
      return NextResponse.json({ error: 'Task does not have a pull request' }, { status: 400 })
    }

    // Get user's authenticated GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json(
        {
          error: 'GitHub authentication required. Please connect your GitHub account.',
        },
        { status: 401 },
      )
    }

    // Parse repository URL
    const parsed = parseGitHubUrl(task.repoUrl)
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
    }

    const { owner, repo } = parsed

    try {
      // Reopen the pull request
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: task.prNumber,
        state: 'open',
      })

      // Update task status in database
      await db
        .update(tasks)
        .set({
          prStatus: 'open',
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id))

      return NextResponse.json({
        success: true,
        message: 'Pull request reopened successfully',
      })
    } catch (error: unknown) {
      console.error('Error reopening pull request:', error)

      // Handle specific error cases
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status
        if (status === 404) {
          return NextResponse.json(
            {
              error: 'Pull request not found',
            },
            { status: 404 },
          )
        }
        if (status === 403) {
          return NextResponse.json(
            {
              error: 'Permission denied. Check repository access',
            },
            { status: 403 },
          )
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to reopen pull request',
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in reopen PR API:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
