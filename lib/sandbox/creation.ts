import { Sandbox } from '@vercel/sandbox'
import { setTimeout } from 'timers/promises'
import { validateEnvironmentVariables, createAuthenticatedRepoUrl } from './config'
import { runCommandInSandbox } from './commands'
import { generateId } from '@/lib/utils/id'
import { SandboxConfig, SandboxResult } from './types'
import { redactSensitiveInfo } from '@/lib/utils/logging'

// Helper function to run command and log it
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logs: string[]) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  logs.push(`$ ${redactSensitiveInfo(fullCommand)}`)

  const result = await runCommandInSandbox(sandbox, command, args)

  if (result.output && result.output.trim()) {
    logs.push(redactSensitiveInfo(result.output.trim()))
  }

  if (!result.success && result.error) {
    logs.push(`Error: ${redactSensitiveInfo(result.error)}`)
  }

  return result
}

export async function createSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const logs: string[] = []

  try {
    logs.push('Creating Vercel sandbox...')
    logs.push(`Repository URL: ${redactSensitiveInfo(config.repoUrl)}`)

    // Call progress callback if provided
    if (config.onProgress) {
      await config.onProgress(20, 'Validating environment variables...')
    }

    // Validate required environment variables
    const envValidation = validateEnvironmentVariables(config.selectedAgent)
    if (!envValidation.valid) {
      throw new Error(envValidation.error!)
    }
    logs.push('Environment variables validated')

    // Handle private repository authentication
    const authenticatedRepoUrl = createAuthenticatedRepoUrl(config.repoUrl)
    logs.push('Added GitHub authentication to repository URL')

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

    logs.push(
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
      await config.onProgress(25, 'Creating Vercel sandbox instance...')
    }

    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create(sandboxConfig)
      logs.push('Sandbox created successfully')

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
        logs.push(`Sandbox creation timed out after 5 minutes`)
        logs.push(`This usually happens when the repository is large or has many dependencies`)
        throw new Error('Sandbox creation timed out. Try with a smaller repository or fewer dependencies.')
      }

      logs.push(`Sandbox creation failed: ${errorMessage}`)
      if (errorResponse) {
        logs.push(`HTTP Status: ${errorResponse.status}`)
        logs.push(`Response: ${JSON.stringify(errorResponse.data)}`)
      }
      throw error
    }

    // Install project dependencies (pnpm only)
    logs.push('Installing project dependencies with pnpm...')

    // First install pnpm globally
    logs.push('Installing pnpm globally...')
    const pnpmGlobalInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'pnpm'])

    if (!pnpmGlobalInstall.success) {
      logs.push('pnpm global install failed')
      logs.push(`npm exit code: ${pnpmGlobalInstall.exitCode}`)

      if (pnpmGlobalInstall.output) logs.push(`npm stdout: ${pnpmGlobalInstall.output}`)
      if (pnpmGlobalInstall.error) logs.push(`npm stderr: ${pnpmGlobalInstall.error}`)

      throw new Error('Failed to install pnpm globally')
    } else {
      logs.push('pnpm installed globally')

      // Call progress callback after pnpm installation
      if (config.onProgress) {
        await config.onProgress(32, 'pnpm installed, detecting project type...')
      }
    }

    // Check for project type and install dependencies accordingly
    const packageJsonCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'package.json'])

    const requirementsTxtCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'requirements.txt'])

    if (packageJsonCheck.success) {
      // JavaScript/Node.js project
      logs.push('package.json found, installing Node.js dependencies...')

      // Call progress callback before dependency installation
      if (config.onProgress) {
        await config.onProgress(35, 'Installing Node.js dependencies...')
      }

      const pnpmInstall = await runCommandInSandbox(sandbox, 'pnpm', ['install'])

      if (!pnpmInstall.success) {
        logs.push('pnpm install failed')
        logs.push(`pnpm exit code: ${pnpmInstall.exitCode}`)

        if (pnpmInstall.output) logs.push(`pnpm stdout: ${pnpmInstall.output}`)
        if (pnpmInstall.error) logs.push(`pnpm stderr: ${pnpmInstall.error}`)

        // Don't throw error, just log it and continue
        logs.push('Warning: Failed to install Node.js dependencies, but continuing with sandbox setup')
      } else {
        logs.push('Node.js dependencies installed with pnpm')
      }
    } else if (requirementsTxtCheck.success) {
      // Python project
      logs.push('requirements.txt found, installing Python dependencies...')

      // Call progress callback before dependency installation
      if (config.onProgress) {
        await config.onProgress(35, 'Installing Python dependencies...')
      }

      // First install pip if it's not available
      const pipCheck = await runCommandInSandbox(sandbox, 'python3', ['-m', 'pip', '--version'])

      if (!pipCheck.success) {
        logs.push('pip not found, installing pip...')

        // Install pip using get-pip.py in a temporary directory
        const getPipResult = await runCommandInSandbox(sandbox, 'sh', [
          '-c',
          'cd /tmp && curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py && rm -f get-pip.py',
        ])

        if (!getPipResult.success) {
          logs.push('Failed to install pip, trying alternative method...')

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
            logs.push('Warning: Could not install pip, skipping Python dependencies')
            // Continue without Python dependencies
          } else {
            logs.push('pip installed via apt-get')
          }
        }

        logs.push('pip installed successfully')
      } else {
        logs.push('pip is available')

        // Upgrade pip to latest version
        const pipUpgrade = await runCommandInSandbox(sandbox, 'python3', ['-m', 'pip', 'install', '--upgrade', 'pip'])

        if (!pipUpgrade.success) {
          logs.push('Warning: Failed to upgrade pip, continuing anyway')
        } else {
          logs.push('pip upgraded successfully')
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
        logs.push('pip install failed')
        logs.push(`pip exit code: ${pipInstall.exitCode}`)

        if (pipInstall.output) logs.push(`pip stdout: ${pipInstall.output}`)
        if (pipInstall.error) logs.push(`pip stderr: ${pipInstall.error}`)

        // Don't throw error, just log it and continue
        logs.push('Warning: Failed to install Python dependencies, but continuing with sandbox setup')
      } else {
        logs.push('Python dependencies installed successfully')
      }
    } else {
      logs.push('No package.json or requirements.txt found, skipping dependency installation')
    }

    // Get the domain for the sandbox
    const domain = sandbox.domain(config.ports?.[0] || 3000)

    // Start the development server based on project type
    if (packageJsonCheck.success) {
      logs.push('Starting Node.js development server...')
      await runCommandInSandbox(sandbox, 'pnpm', ['run', 'dev'])

      // Wait for server to start
      await setTimeout(2000)

      logs.push(`Node.js development server started at: ${domain}`)
    } else if (requirementsTxtCheck.success) {
      logs.push('Python project detected, sandbox ready for Python development')
      logs.push(`Sandbox available at: ${domain}`)

      // Check if there's a common Python web framework entry point
      const flaskAppCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'app.py'])

      const djangoManageCheck = await runCommandInSandbox(sandbox, 'test', ['-f', 'manage.py'])

      if (flaskAppCheck.success) {
        logs.push('Flask app.py detected, you can run: python3 app.py')
      } else if (djangoManageCheck.success) {
        logs.push('Django manage.py detected, you can run: python3 manage.py runserver')
      }
    } else {
      logs.push('No package.json or requirements.txt found, skipping development server start')
      logs.push(`Sandbox available at: ${domain}`)
    }

    // Configure Git user
    await runCommandInSandbox(sandbox, 'git', ['config', 'user.name', 'Coding Agent'])
    await runCommandInSandbox(sandbox, 'git', ['config', 'user.email', 'agent@example.com'])

    // Configure Git to use GitHub token for authentication
    if (process.env.GITHUB_TOKEN) {
      logs.push('Configuring Git authentication with GitHub token')
      await runCommandInSandbox(sandbox, 'git', ['config', 'credential.helper', 'store'])

      // Create credentials file with GitHub token
      const credentialsContent = `https://${process.env.GITHUB_TOKEN}:x-oauth-basic@github.com`
      await runCommandInSandbox(sandbox, 'sh', ['-c', `echo "${credentialsContent}" > ~/.git-credentials`])
    }

    let branchName: string

    if (config.existingBranchName) {
      // Checkout existing branch for continuing work
      logs.push(`Checking out existing branch: ${config.existingBranchName}`)
      const checkoutResult = await runAndLogCommand(sandbox, 'git', ['checkout', config.existingBranchName], logs)

      if (!checkoutResult.success) {
        throw new Error(`Failed to checkout existing branch ${config.existingBranchName}`)
      }

      // Get the latest changes from remote
      logs.push('Pulling latest changes from remote...')
      const pullResult = await runAndLogCommand(sandbox, 'git', ['pull', 'origin', config.existingBranchName], logs)

      if (pullResult.output) {
        logs.push(`Git pull output: ${pullResult.output}`)
      }

      branchName = config.existingBranchName
    } else if (config.preDeterminedBranchName) {
      // Use the AI-generated branch name
      logs.push(`Using pre-determined branch name: ${config.preDeterminedBranchName}`)
      const createBranch = await runAndLogCommand(
        sandbox,
        'git',
        ['checkout', '-b', config.preDeterminedBranchName],
        logs,
      )

      if (!createBranch.success) {
        logs.push(`Failed to create branch ${config.preDeterminedBranchName}: ${createBranch.error}`)
        throw new Error(`Failed to create Git branch ${config.preDeterminedBranchName}`)
      }

      logs.push(`Successfully created branch: ${config.preDeterminedBranchName}`)
      branchName = config.preDeterminedBranchName
    } else {
      // Fallback: Create a timestamp-based branch name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const suffix = generateId()
      branchName = `agent/${timestamp}-${suffix}`

      logs.push(`No predetermined branch name, using timestamp-based: ${branchName}`)
      const createBranch = await runAndLogCommand(sandbox, 'git', ['checkout', '-b', branchName], logs)

      if (!createBranch.success) {
        logs.push(`Failed to create branch ${branchName}: ${createBranch.error}`)
        throw new Error(`Failed to create Git branch ${branchName}`)
      }

      logs.push(`Successfully created fallback branch: ${branchName}`)
    }

    return {
      success: true,
      sandbox,
      domain,
      logs,
      branchName,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Sandbox creation error:', error)
    logs.push(`Error: ${errorMessage}`)

    return {
      success: false,
      error: errorMessage || 'Failed to create sandbox',
      logs,
    }
  }
}
