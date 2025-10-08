import { Sandbox } from '@vercel/sandbox'
import { SandboxProvider, SandboxConfig, SandboxInstance, SandboxResult, ExecutionResult } from './types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { validateEnvironmentVariables, createAuthenticatedRepoUrl } from '../config'
import { runCommandInSandbox } from '../commands'
import { generateId } from '@/lib/utils/id'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { detectPackageManager, installDependencies } from '../package-manager'
import { registerSandbox, unregisterSandbox } from '../sandbox-registry'
import { AgentType, executeAgentInSandbox } from '../agents'
import { Connector } from '@/lib/db/schema'

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

export class VercelSandboxProvider implements SandboxProvider {
  readonly type = 'vercel' as const

  async create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
    try {
      await logger.info(`Repository URL: ${redactSensitiveInfo(config.repoUrl)}`)

      if (config.onCancellationCheck && (await config.onCancellationCheck())) {
        await logger.info('Task was cancelled before sandbox creation')
        return { success: false, cancelled: true }
      }

      if (config.onProgress) {
        await config.onProgress(20, 'Validating environment variables...')
      }

      const envValidation = validateEnvironmentVariables(config.selectedAgent)
      if (!envValidation.valid) {
        throw new Error(envValidation.error!)
      }
      await logger.info('Environment variables validated')

      const authenticatedRepoUrl = createAuthenticatedRepoUrl(config.repoUrl)
      await logger.info('Added GitHub authentication to repository URL')

      const branchNameForEnv = config.existingBranchName

      const sandboxConfig = {
        teamId: process.env.VERCEL_TEAM_ID!,
        projectId: process.env.VERCEL_PROJECT_ID!,
        token: process.env.VERCEL_TOKEN!,
        source: {
          type: 'git' as const,
          url: authenticatedRepoUrl,
          revision: branchNameForEnv || 'main',
          depth: 1,
        },
        timeout: config.timeout ? parseInt(config.timeout.replace(/\D/g, '')) * 60 * 1000 : 5 * 60 * 1000,
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

      if (config.onProgress) {
        await config.onProgress(25, 'Validating configuration...')
      }

      let sandbox: Sandbox
      try {
        sandbox = await Sandbox.create(sandboxConfig)
        await logger.info('Sandbox created successfully')

        registerSandbox(config.taskId, sandbox)

        if (config.onCancellationCheck && (await config.onCancellationCheck())) {
          await logger.info('Task was cancelled after sandbox creation')
          return { success: false, cancelled: true }
        }

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

      if (config.installDependencies !== false) {
        await logger.info('Detecting project type and installing dependencies...')
      } else {
        await logger.info('Skipping dependency installation as requested by user')
      }

      const packageJsonCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'package.json'])
      const requirementsTxtCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'requirements.txt'])

      if (config.installDependencies !== false) {
        if (packageJsonCheck.success) {
          await logger.info('package.json found, installing Node.js dependencies...')

          const packageManager = await detectPackageManager(sandbox, logger)

          if (packageManager === 'pnpm') {
            const pnpmCheck = await runCommandInSandbox(sandbox, 'which', ['pnpm'])
            if (!pnpmCheck.success) {
              await logger.info('Installing pnpm globally...')
              const pnpmGlobalInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'pnpm'])
              if (!pnpmGlobalInstall.success) {
                await logger.error('Failed to install pnpm globally, falling back to npm')
                const npmResult = await installDependencies(sandbox, 'npm', logger)
                if (!npmResult.success) {
                  await logger.info(
                    'Warning: Failed to install Node.js dependencies, but continuing with sandbox setup',
                  )
                }
              } else {
                await logger.info('pnpm installed globally')
              }
            }
          } else if (packageManager === 'yarn') {
            const yarnCheck = await runCommandInSandbox(sandbox, 'which', ['yarn'])
            if (!yarnCheck.success) {
              await logger.info('Installing yarn globally...')
              const yarnGlobalInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'yarn'])
              if (!yarnGlobalInstall.success) {
                await logger.error('Failed to install yarn globally, falling back to npm')
                const npmResult = await installDependencies(sandbox, 'npm', logger)
                if (!npmResult.success) {
                  await logger.info(
                    'Warning: Failed to install Node.js dependencies, but continuing with sandbox setup',
                  )
                }
              } else {
                await logger.info('yarn installed globally')
              }
            }
          }

          if (config.onProgress) {
            await config.onProgress(35, 'Installing Node.js dependencies...')
          }

          const installResult = await installDependencies(sandbox, packageManager, logger)

          if (config.onCancellationCheck && (await config.onCancellationCheck())) {
            await logger.info('Task was cancelled after dependency installation')
            return { success: false, cancelled: true }
          }

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
          await logger.info('requirements.txt found, installing Python dependencies...')

          if (config.onProgress) {
            await config.onProgress(35, 'Installing Python dependencies...')
          }

          const pipCheck = await runCommandInSandbox(sandbox, 'python3', ['-m', 'pip', '--version'])

          if (!pipCheck.success) {
            await logger.info('pip not found, installing pip...')

            const getPipResult = await runCommandInSandbox(sandbox, 'sh', [
              '-c',
              'cd /tmp && curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py && rm -f get-pip.py',
            ])

            if (!getPipResult.success) {
              await logger.info('Failed to install pip, trying alternative method...')

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
              } else {
                await logger.info('pip installed via apt-get')
              }
            }

            await logger.info('pip installed successfully')
          } else {
            await logger.info('pip is available')

            const pipUpgrade = await runCommandInSandbox(sandbox, 'python3', [
              '-m',
              'pip',
              'install',
              '--upgrade',
              'pip',
            ])

            if (!pipUpgrade.success) {
              await logger.info('Warning: Failed to upgrade pip, continuing anyway')
            } else {
              await logger.info('pip upgraded successfully')
            }
          }

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

            await logger.info('Warning: Failed to install Python dependencies, but continuing with sandbox setup')
          } else {
            await logger.info('Python dependencies installed successfully')
          }
        } else {
          await logger.info('No package.json or requirements.txt found, skipping dependency installation')
        }
      }

      const domain = sandbox.domain(config.ports?.[0] || 3000)

      if (packageJsonCheck.success) {
        await logger.info('Node.js project detected, sandbox ready for development')
        await logger.info(`Sandbox available at: ${domain}`)
      } else if (requirementsTxtCheck.success) {
        await logger.info('Python project detected, sandbox ready for development')
        await logger.info(`Sandbox available at: ${domain}`)

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

      if (config.onCancellationCheck && (await config.onCancellationCheck())) {
        await logger.info('Task was cancelled before Git configuration')
        return { success: false, cancelled: true }
      }

      await runCommandInSandbox(sandbox, 'git', ['config', 'user.name', 'Coding Agent'])
      await runCommandInSandbox(sandbox, 'git', ['config', 'user.email', 'agent@example.com'])

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

      await logger.info('Debugging Git repository state...')
      const gitStatusDebug = await runCommandInSandbox(sandbox, 'git', ['status', '--porcelain'])
      await logger.info(`Git status (porcelain): ${gitStatusDebug.output || 'Clean working directory'}`)

      const gitBranchDebug = await runCommandInSandbox(sandbox, 'git', ['branch', '-a'])
      await logger.info(`Available branches: ${gitBranchDebug.output || 'No branches listed'}`)

      const gitRemoteDebug = await runCommandInSandbox(sandbox, 'git', ['remote', '-v'])
      const redactedRemotes = gitRemoteDebug.output
        ? redactSensitiveInfo(gitRemoteDebug.output)
        : 'No remotes configured'
      await logger.info(`Git remotes: ${redactedRemotes}`)

      if (process.env.GITHUB_TOKEN) {
        await logger.info('Configuring Git authentication with GitHub token')
        await runCommandInSandbox(sandbox, 'git', ['config', 'credential.helper', 'store'])

        const credentialsContent = `https://${process.env.GITHUB_TOKEN}:x-oauth-basic@github.com`
        await runCommandInSandbox(sandbox, 'sh', ['-c', `echo "${credentialsContent}" > ~/.git-credentials`])
      }

      let branchName: string

      if (config.existingBranchName) {
        await logger.info(`Checking out existing branch: ${config.existingBranchName}`)
        const checkoutResult = await runAndLogCommand(sandbox, 'git', ['checkout', config.existingBranchName], logger)

        if (!checkoutResult.success) {
          throw new Error(`Failed to checkout existing branch ${config.existingBranchName}`)
        }

        await logger.info('Pulling latest changes from remote...')
        const pullResult = await runAndLogCommand(sandbox, 'git', ['pull', 'origin', config.existingBranchName], logger)

        if (pullResult.output) {
          await logger.info(`Git pull output: ${pullResult.output}`)
        }

        branchName = config.existingBranchName
      } else if (config.preDeterminedBranchName) {
        await logger.info(`Using pre-determined branch name: ${config.preDeterminedBranchName}`)

        const branchExistsLocal = await runCommandInSandbox(sandbox, 'git', [
          'show-ref',
          '--verify',
          '--quiet',
          `refs/heads/${config.preDeterminedBranchName}`,
        ])

        if (branchExistsLocal.success) {
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
          const branchExistsRemote = await runCommandInSandbox(sandbox, 'git', [
            'ls-remote',
            '--heads',
            'origin',
            config.preDeterminedBranchName,
          ])

          if (branchExistsRemote.success && branchExistsRemote.output?.trim()) {
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
            await logger.info(`Creating new branch: ${config.preDeterminedBranchName}`)
            const createBranch = await runAndLogCommand(
              sandbox,
              'git',
              ['checkout', '-b', config.preDeterminedBranchName],
              logger,
            )

            if (!createBranch.success) {
              await logger.info(`Failed to create branch ${config.preDeterminedBranchName}: ${createBranch.error}`)
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
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        const suffix = generateId()
        branchName = `agent/${timestamp}-${suffix}`

        await logger.info(`No predetermined branch name, using timestamp-based: ${branchName}`)
        const createBranch = await runAndLogCommand(sandbox, 'git', ['checkout', '-b', branchName], logger)

        if (!createBranch.success) {
          await logger.info(`Failed to create branch ${branchName}: ${createBranch.error}`)
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

      const sandboxInstance: SandboxInstance = {
        id: config.taskId,
        type: 'vercel',
        domain,
        nativeSandbox: sandbox,
      }

      return {
        success: true,
        sandbox: sandboxInstance,
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

  async executeAgent(
    sandbox: SandboxInstance,
    instruction: string,
    agentType: AgentType,
    logger: TaskLogger,
    selectedModel?: string,
    mcpServers?: Connector[],
    onCancellationCheck?: () => Promise<boolean>,
  ): Promise<ExecutionResult> {
    if (!sandbox.nativeSandbox) {
      return {
        success: false,
        error: 'Native Vercel sandbox not available',
      }
    }

    return executeAgentInSandbox(
      sandbox.nativeSandbox,
      instruction,
      agentType,
      logger,
      selectedModel,
      mcpServers,
      onCancellationCheck,
    )
  }

  async destroy(sandbox: SandboxInstance, logger: TaskLogger): Promise<{ success: boolean; error?: string }> {
    try {
      if (!sandbox.nativeSandbox) {
        return { success: false, error: 'Native Vercel sandbox not available' }
      }

      unregisterSandbox(sandbox.id)
      await logger.success('Sandbox shutdown completed')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      await logger.error(`Sandbox shutdown failed: ${errorMessage}`)
      return { success: false, error: errorMessage }
    }
  }
}
