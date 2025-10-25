import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { redactSensitiveInfo } from '@/lib/utils/logging'

const { tasks, logEntrySchema } = schema

// Schema for the request body
const clientLogsSchema = z.object({
  logs: z.array(logEntrySchema),
})

/**
 * POST /api/tasks/[taskId]/client-logs
 * Append client-side logs to the task's log database
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Parse the request body
    const body = await request.json()
    const { logs } = clientLogsSchema.parse(body)

    if (!logs || logs.length === 0) {
      return NextResponse.json({ error: 'No logs provided' }, { status: 400 })
    }

    // Get the task and verify ownership (exclude soft-deleted)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Redact sensitive information from all log messages
    const sanitizedLogs = logs.map((log) => ({
      ...log,
      message: redactSensitiveInfo(log.message),
      timestamp: log.timestamp || new Date(),
    }))

    // Append the client logs to the existing logs
    const existingLogs = task.logs || []
    const updatedLogs = [...existingLogs, ...sanitizedLogs]

    await db.update(tasks).set({ logs: updatedLogs, updatedAt: new Date() }).where(eq(tasks.id, taskId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error appending client logs:', error)
    return NextResponse.json({ error: 'Failed to append client logs' }, { status: 500 })
  }
}
