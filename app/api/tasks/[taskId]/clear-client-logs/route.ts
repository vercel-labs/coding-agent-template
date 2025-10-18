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

    // Get task from database and verify ownership (exclude soft-deleted)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    // Clear client logs by setting to empty array
    await db.update(tasks).set({ clientLogs: [] }).where(eq(tasks.id, taskId))

    return NextResponse.json({
      success: true,
      message: 'Client logs cleared successfully',
    })
  } catch (error) {
    console.error('Error clearing client logs:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to clear client logs' },
      { status: 500 },
    )
  }
}
