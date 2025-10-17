import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'

const { tasks } = schema

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const { partial, cwd } = await request.json()

    if (typeof partial !== 'string') {
      return NextResponse.json({ success: false, error: 'Partial text is required' }, { status: 400 })
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

    try {
      // Get the actual current working directory from the sandbox
      const pwdResult = await sandbox.runCommand('sh', ['-c', 'pwd'])
      let actualCwd = cwd || '/home/vercel-sandbox'

      try {
        const pwdOutput = await pwdResult.stdout()
        if (pwdOutput && pwdOutput.trim()) {
          actualCwd = pwdOutput.trim()
        }
      } catch {
        // Use the provided cwd or default
      }

      // Parse the partial to get the path part
      const parts = partial.split(/\s+/)
      const lastPart = parts[parts.length - 1] || ''

      // Determine the directory and prefix to complete
      let dir = actualCwd
      let prefix = ''

      if (lastPart.includes('/')) {
        const lastSlash = lastPart.lastIndexOf('/')
        const pathPart = lastPart.substring(0, lastSlash + 1)
        prefix = lastPart.substring(lastSlash + 1)

        // Handle absolute vs relative paths
        if (pathPart.startsWith('/')) {
          dir = pathPart
        } else if (pathPart.startsWith('~/')) {
          dir = '/home/vercel-sandbox/' + pathPart.substring(2)
        } else {
          dir = `${actualCwd}/${pathPart}`
        }
      } else {
        prefix = lastPart
      }

      // Escape directory path for safe shell interpolation
      // This prevents shell injection attacks when dir contains special characters
      const escapedDir = "'" + dir.replace(/'/g, "'\\''") + "'"
      // Get directory listing
      const lsCommand = `cd ${escapedDir} 2>/dev/null && ls -1ap 2>/dev/null || echo ""`
      const result = await sandbox.runCommand('sh', ['-c', lsCommand])

      let stdout = ''
      try {
        stdout = await result.stdout()
      } catch {
        // Failed to read stdout
      }

      if (!stdout) {
        return NextResponse.json({
          success: true,
          data: {
            completions: [],
          },
        })
      }

      // Parse the output and filter by prefix (case-insensitive)
      const files = stdout
        .trim()
        .split('\n')
        .filter((f) => f && f.toLowerCase().startsWith(prefix.toLowerCase()))
        .map((f) => ({
          name: f,
          isDirectory: f.endsWith('/'),
        }))

      return NextResponse.json({
        success: true,
        data: {
          completions: files,
          prefix,
        },
      })
    } catch (error) {
      console.error('Error getting completions:', error)
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get completions',
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in autocomplete endpoint:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
