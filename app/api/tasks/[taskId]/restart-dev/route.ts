import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from '@/lib/sandbox/commands'
import { detectPackageManager } from '@/lib/sandbox/package-manager'
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
    const packageJsonCheck = await runInProject(sandbox, 'test', ['-f', 'package.json'])
    if (!packageJsonCheck.success) {
      return NextResponse.json({ error: 'No package.json found in sandbox' }, { status: 400 })
    }

    const packageJsonRead = await runCommandInSandbox(sandbox, 'sh', ['-c', `cd ${PROJECT_DIR} && cat package.json`])
    if (!packageJsonRead.success || !packageJsonRead.output) {
      return NextResponse.json({ error: 'Could not read package.json' }, { status: 500 })
    }

    const packageJson = JSON.parse(packageJsonRead.output)
    const hasDevScript = packageJson?.scripts?.dev

    if (!hasDevScript) {
      return NextResponse.json({ error: 'No dev script found in package.json' }, { status: 400 })
    }

    // Detect Vite projects (use port 5173)
    let devPort = 3000
    const hasVite = packageJson?.dependencies?.vite || packageJson?.devDependencies?.vite
    if (hasVite) {
      devPort = 5173
    }

    // Kill any existing dev server processes (running on the detected port)
    // First try to find the process using lsof, then kill it
    await runCommandInSandbox(sandbox, 'sh', ['-c', `lsof -ti:${devPort} | xargs -r kill -9 2>/dev/null || true`])

    // Wait a moment for the port to be released
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Start the dev server again
    const packageManager = await detectPackageManager(sandbox, logger)
    const devCommand = packageManager === 'npm' ? 'npm' : packageManager
    let devArgs = packageManager === 'npm' ? ['run', 'dev'] : ['dev']

    // Check if Vite project and configure to allow all hosts
    if (hasVite) {
      const { runInProject } = await import('@/lib/sandbox/commands')

      // Always create vite.sandbox.config.js that extends user's config
      const sandboxViteConfig = `import { defineConfig, mergeConfig } from 'vite'

let userConfig = {}
try {
  // Try to import user's config if it exists
  const importedConfig = await import('./vite.config.js')
  userConfig = importedConfig.default || {}
} catch {
  // No user config or import failed, use empty config
}

export default mergeConfig(userConfig, defineConfig({
  server: {
    host: '0.0.0.0',
    strictPort: false,
    // Remove any allowedHosts restrictions for sandbox
    allowedHosts: undefined,
  }
}))`

      await runInProject(sandbox, 'sh', [
        '-c',
        `cat > vite.sandbox.config.js << 'VITEEOF'\n${sandboxViteConfig}\nVITEEOF`,
      ])

      // Add vite.sandbox.config.js to global .gitignore
      const { runCommandInSandbox } = await import('@/lib/sandbox/commands')
      await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        'grep -q "vite.sandbox.config.js" ~/.gitignore_global 2>/dev/null || echo "vite.sandbox.config.js" >> ~/.gitignore_global',
      ])

      // Configure git to use the global gitignore
      await runInProject(sandbox, 'git', ['config', 'core.excludesfile', '~/.gitignore_global'])

      // Use sandbox config
      if (packageManager === 'npm') {
        devArgs = ['run', 'dev', '--', '--config', 'vite.sandbox.config.js', '--host', '0.0.0.0']
      } else {
        devArgs = ['dev', '--config', 'vite.sandbox.config.js', '--host', '0.0.0.0']
      }
    }

    // Check if Next.js 16 and add --webpack flag
    const nextVersion = packageJson?.dependencies?.next || packageJson?.devDependencies?.next || ''
    const isNext16 = nextVersion.startsWith('16.') || nextVersion.startsWith('^16.') || nextVersion.startsWith('~16.')

    if (isNext16) {
      if (packageManager === 'npm') {
        devArgs = ['run', 'dev', '--', '--webpack']
      } else {
        devArgs = ['dev', '--webpack']
      }
    }

    // Start dev server in detached mode with log capture
    const fullDevCommand = devArgs.length > 0 ? `${devCommand} ${devArgs.join(' ')}` : devCommand

    // Import Writable for stream capture
    const { Writable } = await import('stream')

    const captureServerStdout = new Writable({
      write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        const lines = chunk
          .toString()
          .split('\n')
          .filter((line) => line.trim())
        for (const line of lines) {
          logger.info(`[SERVER] ${line}`).catch(() => {})
        }
        callback()
      },
    })

    const captureServerStderr = new Writable({
      write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        const lines = chunk
          .toString()
          .split('\n')
          .filter((line) => line.trim())
        for (const line of lines) {
          logger.info(`[SERVER] ${line}`).catch(() => {})
        }
        callback()
      },
    })

    await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', `cd ${PROJECT_DIR} && ${fullDevCommand}`],
      detached: true,
      stdout: captureServerStdout,
      stderr: captureServerStderr,
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
