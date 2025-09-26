import { Sandbox } from '@vercel/sandbox'
import { validateEnvironmentVariables, createAuthenticatedRepoUrl } from './config'
import { runCommandInSandbox } from './commands'
import { generateId } from '@/lib/utils/id'
import { SandboxConfig, SandboxResult } from './types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'
import { detectPackageManager, installDependencies } from './package-manager'
import { registerSandbox } from './sandbox-registry'

// Helper function to run command and log it
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  await logger.command(redactedCommand)

  const result = await runCommandInSandbox(sandbox, command, args)

  if (result && result.output && result.output.trim()) {
    const redactedOutput = redactSensitiveInfo(result.output.trim())
    await logger.info(redactedOutput)
  }

  if (result && !result.success && result.error) {
    const redactedError = redactSensitiveInfo(result.error)
    await logger.error(redactedError)
  }

  return result
}

export async function createSandbox(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
  try {
    await logger.info(`Repository URL: ${redactSensitiveInfo(config.repoUrl)}`)

    // Check for cancellation before starting
    if (config.onCancellationCheck && (await config.onCancellationCheck())) {
      await logger.info('Task was cancelled before sandbox creation')
      return { success: false, cancelled: true }
    }

    // Call progress callback if provided
    if (config.onProgress) {
      await config.onProgress(20, 'Validating environment variables...')
    }

    // Validate required environment variables
    const envValidation = validateEnvironmentVariables(config.selectedAgent)
    if (!envValidation.valid) {
      throw new Error(envValidation.error!)
    }
    await logger.info('Environment variables validated')

    // Handle private repository authentication
    const authenticatedRepoUrl = createAuthenticatedRepoUrl(config.repoUrl)
    await logger.info('Added GitHub authentication to repository URL')

    // For initial clone, only use existing branch names, not AI-generated ones
    // AI-generated branch names will be created later inside the sandbox
    const branchNameForEnv = config.existingBranchName

    // Create sandbox with proper source configuration
    const sandboxConfig = {
      teamId: process.env.VERCEL_TEAM_ID!,
      projectId: process.env.VERCEL_PROJECT_ID!,
      token: process.env.VERCEL_TOKEN!,
      source: {
        type: 'git' as const,
        url: authenticatedRepoUrl,
        revision: branchNameForEnv || 'main',
        depth: 1, // Shallow clone for faster setup
      },
      timeout: config.timeout ? parseInt(config.timeout.replace(/\D/g, '')) * 60 * 1000 : 5 * 60 * 1000, // Convert to milliseconds
      ports: config.ports || [3000],
      runtime: config.runtime || 'node22',
      resources: { vcpus: config.resources?.vcpus || 4 },
    }

    await logger.info(
      `Sandbox config: ${JSON.stringify(
        {
          ...sandboxConfig,
          token: '[REDACTED]',
          source: { ...sandboxConfig.source, url: '[REDACTED]' },
        },
        null,
        2,
      )}`,
    )

    // Call progress callback before sandbox creation
    if (config.onProgress) {
      await config.onProgress(25, 'Validating configuration...')
    }

    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create(sandboxConfig)
      await logger.info('Sandbox created successfully')

      // Register the sandbox immediately for potential killing
      registerSandbox(config.taskId, sandbox)

      // Check for cancellation after sandbox creation
      if (config.onCancellationCheck && (await config.onCancellationCheck())) {
        await logger.info('Task was cancelled after sandbox creation')
        return { success: false, cancelled: true }
      }

      // Call progress callback after sandbox creation
      if (config.onProgress) {
        await config.onProgress(30, 'Sandbox created, installing dependencies...')
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      const errorName = error instanceof Error ? error.name : 'UnknownError'
      const errorCode =
        error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined
      const errorResponse =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { status?: number; data?: unknown } }).response
          : undefined

      // Check if this is a timeout error
      if (errorMessage?.includes('timeout') || errorCode === 'ETIMEDOUT' || errorName === 'TimeoutError') {
        await logger.error(`Sandbox creation timed out after 5 minutes`)
        await logger.error(`This usually happens when the repository is large or has many dependencies`)
        throw new Error('Sandbox creation timed out. Try with a smaller repository or fewer dependencies.')
      }

      await logger.error(`Sandbox creation failed: ${errorMessage}`)
      if (errorResponse) {
        await logger.error(`HTTP Status: ${errorResponse.status}`)
        await logger.error(`Response: ${JSON.stringify(errorResponse.data)}`)
      }
      throw error
    }

    // Install project dependencies (based on user preference)
    if (config.installDependencies !== false) {
      await logger.info('Detecting project type and installing dependencies...')
    } else {
      await logger.info('Skipping dependency installation as requested by user')
    }

    // Check for project type and install dependencies accordingly
    const packageJsonCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'package.json'])
    const requirementsTxtCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'requirements.txt'])

    if (config.installDependencies !== false) {
      if (packageJsonCheck.success) {
        // JavaScript/Node.js project
        await logger.info('package.json found, installing Node.js dependencies...')

        // Detect which package manager to use
        const packageManager = await detectPackageManager(sandbox, logger)

        // Install required package manager globally if needed
        if (packageManager === 'pnpm') {
          // Check if pnpm is already installed
          const pnpmCheck = await runCommandInSandbox(sandbox, 'which', ['pnpm'])
          if (!pnpmCheck.success) {
            await logger.info('Installing pnpm globally...')
            const pnpmGlobalInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'pnpm'])
            if (!pnpmGlobalInstall.success) {
              await logger.error('Failed to install pnpm globally, falling back to npm')
              // Fall back to npm if pnpm installation fails
              const npmResult = await installDependencies(sandbox, 'npm', logger)
              if (!npmResult.success) {
                await logger.info('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
              }
            } else {
              await logger.info('pnpm installed globally')
            }
          }
        } else if (packageManager === 'yarn') {
          // Check if yarn is already installed
          const yarnCheck = await runCommandInSandbox(sandbox, 'which', ['yarn'])
          if (!yarnCheck.success) {
            await logger.info('Installing yarn globally...')
            const yarnGlobalInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'yarn'])
            if (!yarnGlobalInstall.success) {
              await logger.error('Failed to install yarn globally, falling back to npm')
              // Fall back to npm if yarn installation fails
              const npmResult = await installDependencies(sandbox, 'npm', logger)
              if (!npmResult.success) {
                await logger.info('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
              }
            } else {
              await logger.info('yarn installed globally')
            }
          }
        }

        // Call progress callback before dependency installation
        if (config.onProgress) {
          await config.onProgress(35, 'Installing Node.js dependencies...')
        }

        // Install dependencies with the detected package manager
        const installResult = await installDependencies(sandbox, packageManager, logger)

        // Check for cancellation after dependency installation
        if (config.onCancellationCheck && (await config.onCancellationCheck())) {
          await logger.info('Task was cancelled after dependency installation')
          return { success: false, cancelled: true }
        }

        // If primary package manager fails, try npm as fallback (unless it was already npm)
        if (!installResult.success && packageManager !== 'npm') {
          await logger.info(`${packageManager} failed, trying npm as fallback...`)

          if (config.onProgress) {
            await config.onProgress(37, `${packageManager} failed, trying npm fallback...`)
          }

          const npmFallbackResult = await installDependencies(sandbox, 'npm', logger)
          if (!npmFallbackResult.success) {
            await logger.info('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
          }
        } else if (!installResult.success) {
          await logger.info('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
        }
      } else if (requirementsTxtCheck.success) {
        // Python project
        await logger.info('requirements.txt found, installing Python dependencies...')

        // Call progress callback before dependency installation
        if (config.onProgress) {
          await config.onProgress(35, 'Installing Python dependencies...')
        }

        // First install pip if it's not available
        const pipCheck = await runCommandInSandbox(sandbox, 'python3', ['-m', 'pip', '--version'])

        if (!pipCheck.success) {
          await logger.info('pip not found, installing pip...')

          // Install pip using get-pip.py in a temporary directory
          const getPipResult = await runCommandInSandbox(sandbox, 'sh', [
            '-c',
            'cd /tmp && curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py && rm -f get-pip.py',
          ])

          if (!getPipResult.success) {
            await logger.info('Failed to install pip, trying alternative method...')

            // Try installing python3-pip package
            const aptResult = await runCommandInSandbox(sandbox, 'apt-get', [
              'update',
              '&&',
              'apt-get',
              'install',
              '-y',
              'python3-pip',
            ])

            if (!aptResult.success) {
              await logger.info('Warning: Could not install pip, skipping Python dependencies')
              // Continue without Python dependencies
            } else {
              await logger.info('pip installed via apt-get')
            }
          }

          await logger.info('pip installed successfully')
        } else {
          await logger.info('pip is available')

          // Upgrade pip to latest version
          const pipUpgrade = await runCommandInSandbox(sandbox, 'python3', ['-m', 'pip', 'install', '--upgrade', 'pip'])

          if (!pipUpgrade.success) {
            await logger.info('Warning: Failed to upgrade pip, continuing anyway')
          } else {
            await logger.info('pip upgraded successfully')
          }
        }

        // Install dependencies from requirements.txt
        const pipInstall = await runCommandInSandbox(sandbox, 'python3', [
          '-m',
          'pip',
          'install',
          '-r',
          'requirements.txt',
        ])

        if (!pipInstall.success) {
          await logger.info('pip install failed')
          await logger.info(`pip exit code: ${pipInstall.exitCode}`)

          if (pipInstall.output) await logger.info(`pip stdout: ${pipInstall.output}`)
          if (pipInstall.error) await logger.info(`pip stderr: ${pipInstall.error}`)

          // Don't throw error, just log it and continue
          await logger.info('Warning: Failed to install Python dependencies, but continuing with sandbox setup')
        } else {
          await logger.info('Python dependencies installed successfully')
        }
      } else {
        await logger.info('No package.json or requirements.txt found, skipping dependency installation')
      }
    } // End of installDependencies check

    // Get the domain for the sandbox
    const domain = sandbox.domain(config.ports?.[0] || 3000)

    // Log sandbox readiness based on project type
    if (packageJsonCheck.success) {
      await logger.info('Node.js project detected, sandbox ready for development')
      await logger.info(`Sandbox available at: ${domain}`)
    } else if (requirementsTxtCheck.success) {
      await logger.info('Python project detected, sandbox ready for development')
      await logger.info(`Sandbox available at: ${domain}`)

      // Check if there's a common Python web framework entry point
      const flaskAppCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'app.py'])
      const djangoManageCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'manage.py'])

      if (flaskAppCheck.success) {
        await logger.info('Flask app.py detected, you can run: python3 app.py')
      } else if (djangoManageCheck.success) {
        await logger.info('Django manage.py detected, you can run: python3 manage.py runserver')
      }
    } else {
      await logger.info('Project type not detected, sandbox ready for general development')
      await logger.info(`Sandbox available at: ${domain}`)
    }

    // Check for cancellation before Git configuration
    if (config.onCancellationCheck && (await config.onCancellationCheck())) {
      await logger.info('Task was cancelled before Git configuration')
      return { success: false, cancelled: true }
    }

    // Configure Git user
    await runCommandInSandbox(sandbox, 'git', ['config', 'user.name', 'Coding Agent'])
    await runCommandInSandbox(sandbox, 'git', ['config', 'user.email', 'agent@example.com'])

    // Verify we're in a Git repository
    const gitRepoCheck = await runCommandInSandbox(sandbox, 'git', ['rev-parse', '--git-dir'])
    if (!gitRepoCheck.success) {
      await logger.info('Not in a Git repository, initializing...')
      const gitInit = await runCommandInSandbox(sandbox, 'git', ['init'])
      if (!gitInit.success) {
        throw new Error('Failed to initialize Git repository')
      }
      await logger.info('Git repository initialized')
    } else {
      await logger.info('Git repository detected')
    }

    // Add debugging information about Git state
    await logger.info('Debugging Git repository state...')
    const gitStatusDebug = await runCommandInSandbox(sandbox, 'git', ['status', '--porcelain'])
    await logger.info(`Git status (porcelain): ${gitStatusDebug.output || 'Clean working directory'}`)

    const gitBranchDebug = await runCommandInSandbox(sandbox, 'git', ['branch', '-a'])
    await logger.info(`Available branches: ${gitBranchDebug.output || 'No branches listed'}`)

    const gitRemoteDebug = await runCommandInSandbox(sandbox, 'git', ['remote', '-v'])
    await logger.info(`Git remotes: ${gitRemoteDebug.output || 'No remotes configured'}`)

    // Configure Git to use GitHub token for authentication
    if (process.env.GITHUB_TOKEN) {
      await logger.info('Configuring Git authentication with GitHub token')
      await runCommandInSandbox(sandbox, 'git', ['config', 'credential.helper', 'store'])

      // Create credentials file with GitHub token
      const credentialsContent = `https://${process.env.GITHUB_TOKEN}:x-oauth-basic@github.com`
      await runCommandInSandbox(sandbox, 'sh', ['-c', `echo "${credentialsContent}" > ~/.git-credentials`])
    }

    let branchName: string

    if (config.existingBranchName) {
      // Checkout existing branch for continuing work
      await logger.info(`Checking out existing branch: ${config.existingBranchName}`)
      const checkoutResult = await runAndLogCommand(sandbox, 'git', ['checkout', config.existingBranchName], logger)

      if (!checkoutResult.success) {
        throw new Error(`Failed to checkout existing branch ${config.existingBranchName}`)
      }

      // Get the latest changes from remote
      await logger.info('Pulling latest changes from remote...')
      const pullResult = await runAndLogCommand(sandbox, 'git', ['pull', 'origin', config.existingBranchName], logger)

      if (pullResult.output) {
        await logger.info(`Git pull output: ${pullResult.output}`)
      }

      branchName = config.existingBranchName
    } else if (config.preDeterminedBranchName) {
      // Use the AI-generated branch name
      await logger.info(`Using pre-determined branch name: ${config.preDeterminedBranchName}`)

      // First check if the branch already exists locally
      const branchExistsLocal = await runCommandInSandbox(sandbox, 'git', [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${config.preDeterminedBranchName}`,
      ])

      if (branchExistsLocal.success) {
        // Branch exists locally, just check it out
        await logger.info(`Branch ${config.preDeterminedBranchName} already exists locally, checking it out`)
        const checkoutBranch = await runAndLogCommand(
          sandbox,
          'git',
          ['checkout', config.preDeterminedBranchName],
          logger,
        )

        if (!checkoutBranch.success) {
          await logger.info(
            `Failed to checkout existing branch ${config.preDeterminedBranchName}: ${checkoutBranch.error}`,
          )
          throw new Error(`Failed to checkout Git branch ${config.preDeterminedBranchName}`)
        }

        branchName = config.preDeterminedBranchName
      } else {
        // Check if branch exists on remote
        const branchExistsRemote = await runCommandInSandbox(sandbox, 'git', [
          'ls-remote',
          '--heads',
          'origin',
          config.preDeterminedBranchName,
        ])

        if (branchExistsRemote.success && branchExistsRemote.output?.trim()) {
          // Branch exists on remote, check it out and track it
          await logger.info(`Branch ${config.preDeterminedBranchName} exists on remote, checking it out`)
          const checkoutRemoteBranch = await runAndLogCommand(
            sandbox,
            'git',
            ['checkout', '-b', config.preDeterminedBranchName, `origin/${config.preDeterminedBranchName}`],
            logger,
          )

          if (!checkoutRemoteBranch.success) {
            await logger.info(
              `Failed to checkout remote branch ${config.preDeterminedBranchName}: ${checkoutRemoteBranch.error}`,
            )
            throw new Error(`Failed to checkout remote Git branch ${config.preDeterminedBranchName}`)
          }

          branchName = config.preDeterminedBranchName
        } else {
          // Branch doesn't exist, create it
          await logger.info(`Creating new branch: ${config.preDeterminedBranchName}`)
          const createBranch = await runAndLogCommand(
            sandbox,
            'git',
            ['checkout', '-b', config.preDeterminedBranchName],
            logger,
          )

          if (!createBranch.success) {
            await logger.info(`Failed to create branch ${config.preDeterminedBranchName}: ${createBranch.error}`)
            // Add debugging information
            const gitStatus = await runCommandInSandbox(sandbox, 'git', ['status'])
            await logger.info(`Git status: ${gitStatus.output || 'No output'}`)
            const gitBranch = await runCommandInSandbox(sandbox, 'git', ['branch', '-a'])
            await logger.info(`Git branches: ${gitBranch.output || 'No output'}`)
            throw new Error(`Failed to create Git branch ${config.preDeterminedBranchName}`)
          }

          await logger.info(`Successfully created branch: ${config.preDeterminedBranchName}`)
          branchName = config.preDeterminedBranchName
        }
      }
    } else {
      // Fallback: Create a timestamp-based branch name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const suffix = generateId()
      branchName = `agent/${timestamp}-${suffix}`

      await logger.info(`No predetermined branch name, using timestamp-based: ${branchName}`)
      const createBranch = await runAndLogCommand(sandbox, 'git', ['checkout', '-b', branchName], logger)

      if (!createBranch.success) {
        await logger.info(`Failed to create branch ${branchName}: ${createBranch.error}`)
        // Add debugging information for fallback branch creation too
        const gitStatus = await runCommandInSandbox(sandbox, 'git', ['status'])
        await logger.info(`Git status: ${gitStatus.output || 'No output'}`)
        const gitBranch = await runCommandInSandbox(sandbox, 'git', ['branch', '-a'])
        await logger.info(`Git branches: ${gitBranch.output || 'No output'}`)
        const gitLog = await runCommandInSandbox(sandbox, 'git', ['log', '--oneline', '-5'])
        await logger.info(`Recent commits: ${gitLog.output || 'No commits'}`)
        throw new Error(`Failed to create Git branch ${branchName}`)
      }

      await logger.info(`Successfully created fallback branch: ${branchName}`)
    }

    return {
      success: true,
      sandbox,
      domain,
      branchName,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Sandbox creation error:', error)
    await logger.error(`Error: ${errorMessage}`)

    return {
      success: false,
      error: errorMessage || 'Failed to create sandbox',
    }
  }
}
