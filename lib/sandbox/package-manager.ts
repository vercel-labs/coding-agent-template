import { Sandbox } from '@vercel/sandbox'
import { runInProject } from './commands'
import { TaskLogger } from '@/lib/utils/task-logger'

// Helper function to detect package manager based on lock files
export async function detectPackageManager(sandbox: Sandbox, logger: TaskLogger): Promise<'pnpm' | 'yarn' | 'npm'> {
  // Check for lock files in order of preference
  const pnpmLockCheck = await runInProject(sandbox, 'test', ['-f', 'pnpm-lock.yaml'])
  if (pnpmLockCheck.success) {
    await logger.info('Detected pnpm package manager')
    return 'pnpm'
  }

  const yarnLockCheck = await runInProject(sandbox, 'test', ['-f', 'yarn.lock'])
  if (yarnLockCheck.success) {
    await logger.info('Detected yarn package manager')
    return 'yarn'
  }

  const npmLockCheck = await runInProject(sandbox, 'test', ['-f', 'package-lock.json'])
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
  let installCommand: string[]
  let logMessage: string

  switch (packageManager) {
    case 'pnpm':
      // Configure pnpm to use /tmp/pnpm-store to avoid large files in project
      const configStore = await runInProject(sandbox, 'pnpm', ['config', 'set', 'store-dir', '/tmp/pnpm-store'])
      if (!configStore.success) {
        await logger.error('Failed to configure pnpm store directory')
      } else {
        await logger.info('Configured pnpm store directory')
      }

      installCommand = ['pnpm', 'install', '--frozen-lockfile']
      logMessage = 'Attempting pnpm install'
      break
    case 'yarn':
      installCommand = ['yarn', 'install', '--frozen-lockfile']
      logMessage = 'Attempting yarn install'
      break
    case 'npm':
      installCommand = ['npm', 'install', '--no-audit', '--no-fund']
      logMessage = 'Attempting npm install'
      break
  }

  await logger.info(logMessage)

  const installResult = await runInProject(sandbox, installCommand[0], installCommand.slice(1))

  if (installResult.success) {
    await logger.info('Node.js dependencies installed')
    return { success: true }
  } else {
    await logger.error('Package manager install failed')

    if (installResult.exitCode !== undefined) {
      await logger.error('Install failed with exit code')
      if (installResult.output) await logger.error('Install stdout available')
      if (installResult.error) await logger.error('Install stderr available')
    } else {
      await logger.error('Install error occurred')
    }

    return { success: false, error: installResult.error }
  }
}

/**
 * Gets the appropriate dev command arguments for the given package manager.
 * Next.js 16+ uses Turbo by default (not Turbopack), which works on Vercel Sandbox.
 */
export async function getDevCommandArgs(_sandbox: Sandbox, packageManager: 'pnpm' | 'yarn' | 'npm'): Promise<string[]> {
  return packageManager === 'npm' ? ['run', 'dev'] : ['dev']
}
