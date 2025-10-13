import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { createPullRequest } from '@/lib/github/client'

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
    const { title, body: prBody, baseBranch = 'main' } = body

    if (!title) {
      return NextResponse.json({ error: 'PR title is required' }, { status: 400 })
    }

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
    if (!task.repoUrl || !task.branchName) {
      return NextResponse.json({ error: 'Task does not have repository or branch information' }, { status: 400 })
    }

    // Check if PR already exists
    if (task.prUrl) {
      return NextResponse.json(
        {
          success: true,
          data: {
            prUrl: task.prUrl,
            prNumber: task.prNumber,
            alreadyExists: true,
          },
        },
        { status: 200 },
      )
    }

    // Create the pull request
    const result = await createPullRequest({
      repoUrl: task.repoUrl,
      branchName: task.branchName,
      title,
      body: prBody,
      baseBranch,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to create pull request' }, { status: 500 })
    }

    // Update task with PR information
    const [updatedTask] = await db
      .update(tasks)
      .set({
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        prStatus: 'open',
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning()

    return NextResponse.json({
      success: true,
      data: {
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        task: updatedTask,
      },
    })
  } catch (error) {
    console.error('Error creating pull request:', error)
    return NextResponse.json({ error: 'Failed to create pull request' }, { status: 500 })
  }
}
