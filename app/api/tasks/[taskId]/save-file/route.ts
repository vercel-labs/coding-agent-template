import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { Sandbox } from '@vercel/sandbox'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { filename, content } = body

    if (!filename || content === undefined) {
      return NextResponse.json({ error: 'Missing filename or content' }, { status: 400 })
    }

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

    // Try to get sandbox from registry first (keyed by taskId, not sandboxId)
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

    try {
      // Escape filename for safe shell interpolation
      // This prevents shell injection attacks when filename contains special characters
      const escapedFilename = "'" + filename.replace(/'/g, "'\\''") + "'"

      // Encode content as base64 to safely handle arbitrary content including special characters
      // This prevents shell injection attacks when content contains sequences like 'EOF'
      const encodedContent = Buffer.from(content).toString('base64')

      // Write file using base64 decoding to avoid heredoc injection vulnerabilities
      // The base64-encoded content cannot contain shell metacharacters or newlines that would break the command
      const writeCommand = `echo '${encodedContent}' | base64 -d > ${escapedFilename}`

      const result = await sandbox.runCommand({
        cmd: 'sh',
        args: ['-c', writeCommand],
        cwd: PROJECT_DIR,
      })

      if (result.exitCode !== 0) {
        let stderr = ''
        try {
          stderr = await result.stderr()
        } catch {
          // Failed to read stderr
        }
        console.error('Failed to write file, stderr:', stderr)
        return NextResponse.json({ error: 'Failed to write file to sandbox' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'File saved successfully',
      })
    } catch (error) {
      console.error('Error writing file to sandbox:', error)
      return NextResponse.json({ error: 'Failed to write file to sandbox' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in save-file API:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
