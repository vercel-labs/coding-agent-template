import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'
import { runCommandInSandbox } from '@/lib/sandbox/commands'
import { detectPackageManager, getDevCommandArgs } from '@/lib/sandbox/package-manager'
import { createTaskLogger } from '@/lib/utils/task-logger'

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

    // Check if sandbox is still alive
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

    const logger = createTaskLogger(taskId)

    // Check if package.json exists and has a dev script
    const packageJsonCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'package.json'])
    if (!packageJsonCheck.success) {
      return NextResponse.json({ error: 'No package.json found in sandbox' }, { status: 400 })
    }

    const packageJsonRead = await runCommandInSandbox(sandbox, 'cat', ['package.json'])
    if (!packageJsonRead.success || !packageJsonRead.output) {
      return NextResponse.json({ error: 'Could not read package.json' }, { status: 500 })
    }

    const packageJson = JSON.parse(packageJsonRead.output)
    const hasDevScript = packageJson?.scripts?.dev

    if (!hasDevScript) {
      return NextResponse.json({ error: 'No dev script found in package.json' }, { status: 400 })
    }

    // Kill any existing dev server processes (running on port 3000)
    // First try to find the process using lsof, then kill it
    await runCommandInSandbox(sandbox, 'sh', ['-c', 'lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true'])

    // Wait a moment for the port to be released
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Start the dev server again
    const packageManager = await detectPackageManager(sandbox, logger)
    const devCommand = packageManager === 'npm' ? 'npm' : packageManager
    const devArgs = await getDevCommandArgs(sandbox, packageManager)

    // Start dev server in detached mode
    await sandbox.runCommand({
      cmd: devCommand,
      args: devArgs,
      detached: true,
    })

    return NextResponse.json({
      success: true,
      message: 'Dev server restarted successfully',
    })
  } catch (error) {
    console.error('Error restarting dev server:', error)
    return NextResponse.json(
      {
        error: 'Failed to restart dev server',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
