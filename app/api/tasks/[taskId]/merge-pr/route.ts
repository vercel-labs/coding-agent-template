import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { mergePullRequest } from '@/lib/github/client'
import { Sandbox } from '@vercel/sandbox'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'

interface RouteParams {
  params: Promise<{
    taskId: string
  }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { commitTitle, commitMessage, mergeMethod = 'squash' } = body

    // Get the task
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Validate task has required fields
    if (!task.repoUrl || !task.prNumber) {
      return NextResponse.json({ error: 'Task does not have repository or PR information' }, { status: 400 })
    }

    // Merge the pull request
    const result = await mergePullRequest({
      repoUrl: task.repoUrl,
      prNumber: task.prNumber,
      commitTitle,
      commitMessage,
      mergeMethod,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to merge pull request' }, { status: 500 })
    }

    // Stop the sandbox if it exists
    if (task.sandboxId) {
      try {
        const sandbox = await Sandbox.get({
          sandboxId: task.sandboxId,
          teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
          projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
          token: process.env.SANDBOX_VERCEL_TOKEN!,
        })

        await sandbox.stop()
        unregisterSandbox(taskId)
      } catch (sandboxError) {
        // Log error but don't fail the merge
        console.error('Error stopping sandbox after merge:', sandboxError)
      }
    }

    // Update task to mark PR as merged, store merge commit SHA, clear sandbox info, and set completedAt
    await db
      .update(tasks)
      .set({
        prStatus: 'merged',
        prMergeCommitSha: result.sha || null,
        sandboxId: null,
        sandboxUrl: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))

    return NextResponse.json({
      success: true,
      data: {
        merged: result.merged,
        message: result.message,
        sha: result.sha,
      },
    })
  } catch (error) {
    console.error('Error merging pull request:', error)
    return NextResponse.json({ error: 'Failed to merge pull request' }, { status: 500 })
  }
}
