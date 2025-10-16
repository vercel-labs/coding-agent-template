import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { Sandbox } from '@vercel/sandbox'

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
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
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task has a sandbox
    if (!task.sandboxId) {
      return NextResponse.json({ error: 'Task does not have an active sandbox' }, { status: 400 })
    }

    // Try to get sandbox from registry first
    let sandbox = getSandbox(taskId)

    // If not in registry, try to reconnect using sandboxId from database
    if (!sandbox) {
      try {
        const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
        const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
        const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID

        if (!sandboxToken || !teamId || !projectId) {
          return NextResponse.json({ error: 'Sandbox credentials not configured' }, { status: 500 })
        }

        sandbox = await Sandbox.get({
          sandboxId: task.sandboxId,
          teamId,
          projectId,
          token: sandboxToken,
        })
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        return NextResponse.json({ error: 'Failed to connect to sandbox' }, { status: 500 })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ error: 'Sandbox not available' }, { status: 400 })
    }

    // With the new LSP integration running in the sandbox, we no longer need to
    // pre-load all project files into Monaco. The LSP has direct access to all
    // files and node_modules, and will handle type resolution on demand.
    //
    // This avoids the "too many open files" error that occurs when trying to
    // load hundreds of files simultaneously.
    return NextResponse.json({
      success: true,
      files: [],
    })
  } catch (error) {
    console.error('Error in project-files API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
