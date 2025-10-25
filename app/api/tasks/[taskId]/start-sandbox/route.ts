import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubUser } from '@/lib/github/client'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { registerSandbox, unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from '@/lib/sandbox/commands'
import { detectPackageManager, installDependencies } from '@/lib/sandbox/package-manager'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'

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

    // Check if keep-alive is enabled
    if (!task.keepAlive) {
      return NextResponse.json({ error: 'Keep-alive is not enabled for this task' }, { status: 400 })
    }

    const logger = createTaskLogger(taskId)

    // Check if sandbox is already running by verifying if it's actually accessible
    if (task.sandboxId && task.sandboxUrl) {
      try {
        const existingSandbox = await Sandbox.get({
          sandboxId: task.sandboxId,
          teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
          projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
          token: process.env.SANDBOX_VERCEL_TOKEN!,
        })

        // Try a simple command to verify it's accessible
        const testResult = await runCommandInSandbox(existingSandbox, 'echo', ['test'])
        if (testResult.success) {
          return NextResponse.json({ error: 'Sandbox is already running' }, { status: 400 })
        }
      } catch (error) {
        // Sandbox is not accessible, clear it from the database and registry, then continue
        await logger.info('Existing sandbox not accessible, clearing and creating new one')
        unregisterSandbox(taskId)
        await db
          .update(tasks)
          .set({
            sandboxId: null,
            sandboxUrl: null,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
      }
    }

    await logger.info('Starting sandbox')

    // Get GitHub user info for git author configuration
    const githubUser = await getGitHubUser()

    // Get max sandbox duration - use task's maxDuration if available, otherwise fall back to global setting
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)
    const maxDurationMinutes = task.maxDuration || maxSandboxDuration

    // Get GitHub token for authenticated API access
    const githubToken = await getUserGitHubToken()

    // Detect the appropriate port for the project
    const port = task.repoUrl ? await detectPortFromRepo(task.repoUrl, githubToken) : 3000
    console.log(`Detected port ${port} for project`)

    // Create a new sandbox by cloning the repo
    const sandbox = await Sandbox.create({
      teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: process.env.SANDBOX_VERCEL_TOKEN!,
      source:
        task.repoUrl && task.branchName
          ? {
              type: 'git' as const,
              url: task.repoUrl,
              revision: task.branchName,
              depth: 1,
            }
          : undefined,
      timeout: maxDurationMinutes * 60 * 1000, // Convert minutes to milliseconds
      ports: [port],
      runtime: 'node22',
      resources: { vcpus: 4 },
    })

    const sandboxId = sandbox?.sandboxId
    await logger.info('Sandbox created')

    // Register the sandbox
    registerSandbox(taskId, sandbox)

    // Configure Git user
    await logger.info('Configuring Git')
    const gitName = githubUser?.name || githubUser?.username || 'Coding Agent'
    const gitEmail = githubUser?.username ? `${githubUser.username}@users.noreply.github.com` : 'agent@example.com'
    await runInProject(sandbox, 'git', ['config', 'user.name', gitName])
    await runInProject(sandbox, 'git', ['config', 'user.email', gitEmail])

    // Check for package.json and requirements.txt
    const packageJsonCheck = await runInProject(sandbox, 'test', ['-f', 'package.json'])
    const requirementsTxtCheck = await runInProject(sandbox, 'test', ['-f', 'requirements.txt'])

    // Install dependencies if package.json exists
    if (packageJsonCheck.success) {
      await logger.info('Installing Node.js dependencies')

      const packageManager = await detectPackageManager(sandbox, logger)
      const installResult = await installDependencies(sandbox, packageManager, logger)

      if (!installResult.success && packageManager !== 'npm') {
        await logger.info('Package manager failed, trying npm as fallback')
        const npmFallbackResult = await installDependencies(sandbox, 'npm', logger)
        if (!npmFallbackResult.success) {
          await logger.info('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
        }
      } else if (!installResult.success) {
        await logger.info('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
      }
    } else if (requirementsTxtCheck.success) {
      await logger.info('Installing Python dependencies')

      // Install pip if needed
      const pipCheck = await runInProject(sandbox, 'python3', ['-m', 'pip', '--version'])
      if (!pipCheck.success) {
        await logger.info('Installing pip')
        await runCommandInSandbox(sandbox, 'sh', [
          '-c',
          'cd /tmp && curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py && rm -f get-pip.py',
        ])
      }

      // Install dependencies
      const pipInstall = await runInProject(sandbox, 'python3', ['-m', 'pip', 'install', '-r', 'requirements.txt'])

      if (!pipInstall.success) {
        await logger.info('Warning: Failed to install Python dependencies, but continuing with sandbox setup')
      }
    }

    let sandboxUrl: string | undefined

    // Start dev server if package.json has dev script
    if (packageJsonCheck.success) {
      const packageJsonRead = await runInProject(sandbox, 'cat', ['package.json'])
      if (packageJsonRead.success && packageJsonRead.output) {
        const packageJson = JSON.parse(packageJsonRead.output)
        const hasDevScript = packageJson?.scripts?.dev

        // Detect Vite projects (use port 5173)
        let devPort = 3000
        const hasVite = packageJson?.dependencies?.vite || packageJson?.devDependencies?.vite
        if (hasVite) {
          devPort = 5173
          await logger.info('Vite project detected, using port 5173')
        }

        if (hasDevScript) {
          await logger.info('Starting development server')

          const packageManager = await detectPackageManager(sandbox, logger)
          const devCommand = packageManager === 'npm' ? 'npm' : packageManager
          let devArgs = packageManager === 'npm' ? ['run', 'dev'] : ['dev']

          // Check if Vite project and configure to allow all hosts
          if (hasVite) {
            await logger.info('Configuring Vite for sandbox environment')

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
            await logger.info('Created sandbox Vite config override')

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
          const isNext16 =
            nextVersion.startsWith('16.') || nextVersion.startsWith('^16.') || nextVersion.startsWith('~16.')

          if (isNext16) {
            await logger.info('Next.js 16 detected, adding --webpack flag')
            if (packageManager === 'npm') {
              devArgs = ['run', 'dev', '--', '--webpack']
            } else {
              devArgs = ['dev', '--webpack']
            }
          }

          // Start dev server in detached mode (runs in background) with log capture
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

          await logger.info('Development server started')

          // Wait a bit for server to start, then get URL
          await new Promise((resolve) => setTimeout(resolve, 3000))
          sandboxUrl = sandbox.domain(port)
        }
      }
    }

    // Update task with new sandbox info
    await db
      .update(tasks)
      .set({
        sandboxId,
        sandboxUrl: sandboxUrl || undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))

    await logger.info('Sandbox started successfully')

    return NextResponse.json({
      success: true,
      message: 'Sandbox started successfully',
      sandboxId,
      sandboxUrl,
    })
  } catch (error) {
    console.error('Error starting sandbox:', error)
    return NextResponse.json(
      {
        error: 'Failed to start sandbox',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
