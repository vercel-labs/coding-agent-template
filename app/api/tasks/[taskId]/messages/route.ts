import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { taskMessages, tasks } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'

export async function GET(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await context.params

    // First, verify that the task belongs to the user
    const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!task.length) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task[0].userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Fetch all messages for this task, ordered by creation time
    const messages = await db
      .select()
      .from(taskMessages)
      .where(eq(taskMessages.taskId, taskId))
      .orderBy(asc(taskMessages.createdAt))

    return NextResponse.json({
      success: true,
      messages,
    })
  } catch (error) {
    console.error('Error fetching task messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}
