import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest, { params }: RouteContext<'/api/tasks/[taskId]'>) {
  try {
    const { taskId } = await params
    const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!task[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ task: task[0] })
  } catch (error) {
    console.error('Error fetching task:', error)
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext<'/api/tasks/[taskId]'>) {
  try {
    const { taskId } = await params

    // Check if task exists first
    const existingTask = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!existingTask[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Delete the task
    await db.delete(tasks).where(eq(tasks.id, taskId))

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
