import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubUser } from '@/lib/github/client'
import { registerSandbox } from '@/lib/sandbox/sandbox-registry'
import { runCommandInSandbox } from '@/lib/sandbox/commands'
import { detectPackageManager, installDependencies } from '@/lib/sandbox/package-manager'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { getMaxSandboxDuration } from '@/lib/db/settings'

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

    // Check if sandbox is already running
    if (task.sandboxId && task.sandboxUrl) {
      return NextResponse.json({ error: 'Sandbox is already running' }, { status: 400 })
    }

    const logger = createTaskLogger(taskId)
    await logger.info('Starting sandbox')

    // Get GitHub user info for git author configuration
    const githubUser = await getGitHubUser()

    // Get max sandbox duration - use task's maxDuration if available, otherwise fall back to global setting
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)
    const maxDurationMinutes = task.maxDuration || maxSandboxDuration

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
      ports: [3000],
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
    await runCommandInSandbox(sandbox, 'git', ['config', 'user.name', gitName])
    await runCommandInSandbox(sandbox, 'git', ['config', 'user.email', gitEmail])

    // Check for package.json and requirements.txt
    const packageJsonCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'package.json'])
    const requirementsTxtCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'requirements.txt'])

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
      const pipCheck = await runCommandInSandbox(sandbox, 'python3', ['-m', 'pip', '--version'])
      if (!pipCheck.success) {
        await logger.info('Installing pip')
        await runCommandInSandbox(sandbox, 'sh', [
          '-c',
          'cd /tmp && curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py && rm -f get-pip.py',
        ])
      }

      // Install dependencies
      const pipInstall = await runCommandInSandbox(sandbox, 'python3', [
        '-m',
        'pip',
        'install',
        '-r',
        'requirements.txt',
      ])

      if (!pipInstall.success) {
        await logger.info('Warning: Failed to install Python dependencies, but continuing with sandbox setup')
      }
    }

    let sandboxUrl: string | undefined

    // Start dev server if package.json has dev script
    if (packageJsonCheck.success) {
      const packageJsonRead = await runCommandInSandbox(sandbox, 'cat', ['package.json'])
      if (packageJsonRead.success && packageJsonRead.output) {
        const packageJson = JSON.parse(packageJsonRead.output)
        const hasDevScript = packageJson?.scripts?.dev

        if (hasDevScript) {
          await logger.info('Starting development server')

          const packageManager = await detectPackageManager(sandbox, logger)
          const devCommand = packageManager === 'npm' ? 'npm' : packageManager
          const devArgs = packageManager === 'npm' ? ['run', 'dev'] : ['dev']

          // Start dev server in detached mode (runs in background)
          await sandbox.runCommand({
            cmd: devCommand,
            args: devArgs,
            detached: true,
          })

          await logger.info('Development server started')

          // Wait a bit for server to start, then get URL
          await new Promise((resolve) => setTimeout(resolve, 3000))
          sandboxUrl = sandbox.domain(3000)
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
