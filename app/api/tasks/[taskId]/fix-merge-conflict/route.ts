import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

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

    // Get the original task
    const [originalTask] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!originalTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Validate task has required fields
    if (!originalTask.repoUrl || !originalTask.branchName) {
      return NextResponse.json({ error: 'Task does not have repository or branch information' }, { status: 400 })
    }

    // Return task data for creating a new task on the client
    return NextResponse.json({
      success: true,
      taskData: {
        repoUrl: originalTask.repoUrl,
        branchName: originalTask.branchName,
        selectedAgent: originalTask.selectedAgent || 'claude',
        selectedModel: originalTask.selectedModel,
        keepAlive: originalTask.keepAlive || false,
        maxDuration: originalTask.maxDuration,
      },
    })
  } catch (error) {
    console.error('Error getting merge conflict fix task data:', error)
    return NextResponse.json({ error: 'Failed to get task data' }, { status: 500 })
  }
}
