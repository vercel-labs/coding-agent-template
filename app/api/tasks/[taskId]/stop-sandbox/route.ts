import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get the task
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Verify ownership
    if (task.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if sandbox is active
    if (!task.sandboxId) {
      return NextResponse.json({ error: 'Sandbox is not active' }, { status: 400 })
    }

    // Reconnect to the sandbox
    const sandbox = await Sandbox.get({
      sandboxId: task.sandboxId,
      teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: process.env.SANDBOX_VERCEL_TOKEN!,
    })

    // Shutdown the sandbox
    await sandbox.stop()

    // Unregister from registry
    unregisterSandbox(taskId)

    // Update task to clear sandbox info
    await db
      .update(tasks)
      .set({
        sandboxId: null,
        sandboxUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))

    return NextResponse.json({
      success: true,
      message: 'Sandbox stopped successfully',
    })
  } catch (error) {
    console.error('Error stopping sandbox:', error)
    return NextResponse.json(
      {
        error: 'Failed to stop sandbox',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
