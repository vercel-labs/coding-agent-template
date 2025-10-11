import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { killSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'

interface RouteParams {
  params: Promise<{
    taskId: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ task: task[0] })
  } catch (error) {
    console.error('Error fetching task:', error)
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()

    // Check if task exists and belongs to user
    const [existingTask] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Handle stop action
    if (body.action === 'stop') {
      // Only allow stopping tasks that are currently processing
      if (existingTask.status !== 'processing') {
        return NextResponse.json({ error: 'Task can only be stopped when it is in progress' }, { status: 400 })
      }

      const logger = createTaskLogger(taskId)

      try {
        // Log the stop request
        await logger.info('Stop request received - terminating task execution...')

        // Update task status to stopped
        const [updatedTask] = await db
          .update(tasks)
          .set({
            status: 'stopped',
            error: 'Task was stopped by user',
            updatedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
          .returning()

        // Kill the sandbox immediately and aggressively
        try {
          const killResult = await killSandbox(taskId)
          if (killResult.success) {
            await logger.success('Sandbox killed successfully')
          } else {
            await logger.error('Failed to kill sandbox')
          }
        } catch (killError) {
          console.error('Failed to kill sandbox during stop:', killError)
          await logger.error('Failed to kill sandbox during stop')
        }

        await logger.error('Task execution stopped by user')

        return NextResponse.json({
          message: 'Task stopped successfully',
          task: updatedTask,
        })
      } catch (error) {
        console.error('Error stopping task:', error)
        await logger.error('Failed to stop task properly')
        return NextResponse.json({ error: 'Failed to stop task' }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Check if task exists and belongs to user (and not deleted)
    const existingTask = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!existingTask[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Soft delete the task by setting deletedAt
    await db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id)))

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
