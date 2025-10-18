import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getPullRequestStatus } from '@/lib/github/client'

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

    // Get PR status from GitHub
    const result = await getPullRequestStatus({
      repoUrl: task.repoUrl,
      prNumber: task.prNumber,
    })

    if (!result.success || !result.status) {
      return NextResponse.json({ error: result.error || 'Failed to get PR status' }, { status: 500 })
    }

    // Update task with current PR status from GitHub
    // Set completedAt when PR is merged
    const updateData: {
      prStatus: 'open' | 'closed' | 'merged'
      prMergeCommitSha: string | null
      completedAt?: Date
      updatedAt: Date
    } = {
      prStatus: result.status,
      prMergeCommitSha: result.mergeCommitSha || null,
      updatedAt: new Date(),
    }

    // Set completedAt timestamp when PR is merged
    if (result.status === 'merged') {
      updateData.completedAt = new Date()
    }

    await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))

    return NextResponse.json({
      success: true,
      data: {
        status: result.status,
        mergeCommitSha: result.mergeCommitSha,
      },
    })
  } catch (error) {
    console.error('Error syncing pull request status:', error)
    return NextResponse.json({ error: 'Failed to sync pull request status' }, { status: 500 })
  }
}
