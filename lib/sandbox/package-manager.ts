import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from './commands'
import { TaskLogger } from '@/lib/utils/task-logger'

/**
 * Detects if the project is using Next.js 16+ by reading package.json from the sandbox.
 * Returns true if Next.js version is 16 or higher, false otherwise.
 */
async function isNextJs16OrHigher(sandbox: Sandbox): Promise<boolean> {
  try {
    // Read package.json from sandbox
    const result = await runCommandInSandbox(sandbox, 'cat', ['package.json'])

    if (!result.success || !result.output) {
      return false
    }

    // Parse package.json
    const packageJson = JSON.parse(result.output)

    // Check for Next.js in dependencies or devDependencies
    const nextVersion = packageJson.dependencies?.next || packageJson.devDependencies?.next

    if (!nextVersion) {
      return false
    }

    // Extract major version number (handle ^16.0.0, ~16.0.0, 16.0.0, etc.)
    const versionMatch = nextVersion.match(/(\d+)\./)
    if (!versionMatch) {
      return false
    }

    const majorVersion = parseInt(versionMatch[1], 10)
    return majorVersion >= 16
  } catch (error) {
    // If any error occurs, return false (use default behavior)
    console.error('Error detecting Next.js version:', error)
    return false
  }
}

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

  const installResult = await runCommandInSandbox(sandbox, installCommand[0], installCommand.slice(1))

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
 * For Next.js 16+, adds --webpack flag instead of --turbopack (since turbo doesn't work on Vercel Sandbox).
 */
export async function getDevCommandArgs(sandbox: Sandbox, packageManager: 'pnpm' | 'yarn' | 'npm'): Promise<string[]> {
  const baseArgs = packageManager === 'npm' ? ['run', 'dev'] : ['dev']

  // Check if this is Next.js 16+ project
  const isNext16 = await isNextJs16OrHigher(sandbox)

  if (isNext16) {
    // Add --webpack flag for Next.js 16+ (turbopack doesn't work on Vercel Sandbox)
    return [...baseArgs, '--', '--webpack']
  }

  return baseArgs
}
