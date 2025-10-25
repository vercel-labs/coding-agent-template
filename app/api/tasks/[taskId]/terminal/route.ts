import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

const { tasks } = schema

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const { command } = await request.json()

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ success: false, error: 'Command is required' }, { status: 400 })
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

    // Check if task has a sandbox
    if (!task.sandboxId) {
      return NextResponse.json({ success: false, error: 'No sandbox found for this task' }, { status: 400 })
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
          return NextResponse.json({ success: false, error: 'Sandbox credentials not configured' }, { status: 500 })
        }

        sandbox = await Sandbox.get({
          sandboxId: task.sandboxId,
          teamId,
          projectId,
          token: sandboxToken,
        })
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        return NextResponse.json({ success: false, error: 'Failed to connect to sandbox' }, { status: 500 })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ success: false, error: 'Sandbox not available' }, { status: 400 })
    }

    // Execute command in sandbox project directory
    try {
      const result = await sandbox.runCommand({
        cmd: 'sh',
        args: ['-c', command],
        cwd: PROJECT_DIR,
      })

      let stdout = ''
      let stderr = ''

      try {
        stdout = await result.stdout()
      } catch {
        // Failed to read stdout
      }

      try {
        stderr = await result.stderr()
      } catch {
        // Failed to read stderr
      }

      return NextResponse.json({
        success: true,
        data: {
          exitCode: result.exitCode,
          stdout,
          stderr,
        },
      })
    } catch (error) {
      console.error('Error executing command:', error)
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Command execution failed',
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in terminal endpoint:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
