import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

const { tasks } = schema

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { type, message } = body

    if (!type || !message) {
      return NextResponse.json({ error: 'Type and message are required' }, { status: 400 })
    }

    // Get task from database and verify ownership (exclude soft-deleted)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    // Add log entry
    const newLog = {
      type,
      message,
      timestamp: new Date(),
    }

    const currentLogs = task.serverLogs || []
    await db
      .update(tasks)
      .set({ serverLogs: [...currentLogs, newLog] })
      .where(eq(tasks.id, taskId))

    return NextResponse.json({
      success: true,
      message: 'Server log added successfully',
    })
  } catch (error) {
    console.error('Error adding server log:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add server log' },
      { status: 500 },
    )
  }
}
