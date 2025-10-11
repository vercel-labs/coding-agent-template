import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from './commands'
import { TaskLogger } from '@/lib/utils/task-logger'

// Type for timeout results
export type TimeoutResult = { success: false; error: string; timedOut: true }

// Helper function to detect package manager based on lock files
export async function detectPackageManager(sandbox: Sandbox, logger: TaskLogger): Promise<'pnpm' | 'yarn' | 'npm'> {
  // Check for lock files in order of preference
  const pnpmLockCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'pnpm-lock.yaml'])
  if (pnpmLockCheck.success) {
    await logger.info('Detected pnpm package manager')
    return 'pnpm'
  }

  const yarnLockCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'yarn.lock'])
  if (yarnLockCheck.success) {
    await logger.info('Detected yarn package manager')
    return 'yarn'
  }

  const npmLockCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'package-lock.json'])
  if (npmLockCheck.success) {
    await logger.info('Detected npm package manager')
    return 'npm'
  }

  // Default to npm if no lock file found
  await logger.info('No lock file found, defaulting to npm')
  return 'npm'
}

// Helper function to install dependencies with the appropriate package manager
export async function installDependencies(
  sandbox: Sandbox,
  packageManager: 'pnpm' | 'yarn' | 'npm',
  logger: TaskLogger,
): Promise<{ success: boolean; error?: string }> {
  const timeoutMinutes = 3
  const timeoutMs = timeoutMinutes * 60 * 1000

  let installCommand: string[]
  let logMessage: string

  switch (packageManager) {
    case 'pnpm':
      // Configure pnpm to use /tmp/pnpm-store to avoid large files in project
      const configStore = await runCommandInSandbox(sandbox, 'pnpm', ['config', 'set', 'store-dir', '/tmp/pnpm-store'])
      if (!configStore.success) {
        await logger.error('Failed to configure pnpm store directory')
      } else {
        await logger.info('Configured pnpm store directory')
      }

      installCommand = ['pnpm', 'install', '--frozen-lockfile']
      logMessage = 'Attempting pnpm install with timeout'
      break
    case 'yarn':
      installCommand = ['yarn', 'install', '--frozen-lockfile']
      logMessage = 'Attempting yarn install with timeout'
      break
    case 'npm':
      installCommand = ['npm', 'install', '--no-audit', '--no-fund']
      logMessage = 'Attempting npm install with timeout'
      break
  }

  await logger.info(logMessage)

  const installWithTimeout = await Promise.race([
    runCommandInSandbox(sandbox, installCommand[0], installCommand.slice(1)),
    new Promise<TimeoutResult>((resolve) => {
      global.setTimeout(() => {
        resolve({
          success: false,
          error: `${packageManager} install timed out after ${timeoutMinutes} minutes`,
          timedOut: true,
        })
      }, timeoutMs)
    }),
  ])

  if (installWithTimeout.success) {
    await logger.info('Node.js dependencies installed')
    return { success: true }
  } else if ('timedOut' in installWithTimeout && installWithTimeout.timedOut) {
    await logger.error('Package manager install timed out')
    return { success: false, error: installWithTimeout.error }
  } else {
    await logger.error('Package manager install failed')

    // Type guard to ensure we have a CommandResult
    if ('exitCode' in installWithTimeout) {
      await logger.error('Install failed with exit code')
      if (installWithTimeout.output) await logger.error('Install stdout available')
      if (installWithTimeout.error) await logger.error('Install stderr available')
    } else {
      await logger.error('Install error occurred')
    }

    return { success: false, error: installWithTimeout.error }
  }
}
