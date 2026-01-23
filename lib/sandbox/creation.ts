import { Sandbox } from '@vercel/sandbox'
import { validateEnvironmentVariables, createAuthenticatedRepoUrl } from './config'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from './commands'
import { generateId } from '@/lib/utils/id'
import { SandboxConfig, SandboxResult } from './types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'
import { detectPackageManager, installDependencies } from './package-manager'
import { registerSandbox } from './sandbox-registry'

// Helper function to run command and log it
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger, cwd?: string) {
  // Properly escape arguments for shell execution
  const escapeArg = (arg: string) => {
    // Escape single quotes by replacing ' with '\''
    return `'${arg.replace(/'/g, "'\\''")}'`
  }

  const fullCommand = args.length > 0 ? `${command} ${args.map(escapeArg).join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  await logger.command(redactedCommand)

  let result
  if (cwd) {
    // Run command in specific directory
    const cdCommand = `cd ${cwd} && ${fullCommand}`
    result = await runCommandInSandbox(sandbox, 'sh', ['-c', cdCommand])
  } else {
    result = await runCommandInSandbox(sandbox, command, args)
  }

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
    await logger.info('Processing repository URL')

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
    const envValidation = validateEnvironmentVariables(config.selectedAgent, config.githubToken, config.apiKeys)
    if (!envValidation.valid) {
      throw new Error(envValidation.error!)
    }
    await logger.info('Environment variables validated')

    // Handle private repository authentication
    const authenticatedRepoUrl = createAuthenticatedRepoUrl(config.repoUrl, config.githubToken)
    await logger.info('Added GitHub authentication to repository URL')

    // Use the specified timeout (maxDuration) for sandbox lifetime
    // keepAlive only controls whether we shutdown after task completion
    const timeoutMs = config.timeout ? parseInt(config.timeout.replace(/\D/g, '')) * 60 * 1000 : 60 * 60 * 1000 // Default 1 hour

    // Determine ports based on project type (will be detected after cloning)
    // Default to both 3000 (Next.js) and 5173 (Vite) for now
    const defaultPorts = config.ports || [3000, 5173]

    // Create sandbox without source - we'll clone manually to /vercel/sandbox/project
    const sandboxConfig = {
      teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: process.env.SANDBOX_VERCEL_TOKEN!,
      timeout: timeoutMs,
      ports: defaultPorts,
      runtime: config.runtime || 'node22',
      resources: { vcpus: config.resources?.vcpus || 4 },
    }

    // Call progress callback before sandbox creation
    if (config.onProgress) {
      await config.onProgress(25, 'Validating configuration...')
    }

    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create(sandboxConfig)
      await logger.info('Sandbox created successfully')

      // Register the sandbox immediately for potential killing
      registerSandbox(config.taskId, sandbox, config.keepAlive || false)

      // Check for cancellation after sandbox creation
      if (config.onCancellationCheck && (await config.onCancellationCheck())) {
        await logger.info('Task was cancelled after sandbox creation')
        return { success: false, cancelled: true }
      }

      // Clone repository to /vercel/sandbox/project
      await logger.info('Cloning repository to project directory...')

      // Create project directory
      const mkdirResult = await runCommandInSandbox(sandbox, 'mkdir', ['-p', PROJECT_DIR])
      if (!mkdirResult.success) {
        throw new Error('Failed to create project directory')
      }

      // Clone the repository with shallow clone
      const cloneResult = await runCommandInSandbox(sandbox, 'git', [
        'clone',
        '--depth',
        '1',
        authenticatedRepoUrl,
        PROJECT_DIR,
      ])

      if (!cloneResult.success) {
        await logger.error('Failed to clone repository')
        throw new Error('Failed to clone repository to project directory')
      }

      await logger.info('Repository cloned successfully')

      // Call progress callback after sandbox creation
      if (config.onProgress) {
        await config.onProgress(30, 'Repository cloned, installing dependencies...')
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

      await logger.error('Sandbox creation failed')
      if (errorResponse) {
        await logger.error('HTTP error occurred')
        await logger.error('Error response received')
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
    const packageJsonCheck = await runInProject(sandbox, 'test', ['-f', 'package.json'])
    const requirementsTxtCheck = await runInProject(sandbox, 'test', ['-f', 'requirements.txt'])

    if (config.installDependencies !== false) {
      if (packageJsonCheck.success) {
        // JavaScript/Node.js project
        await logger.info('package.json found, installing Node.js dependencies...')

        // Detect which package manager to use
        const packageManager = await detectPackageManager(sandbox, logger)

        // Install required package manager globally if needed
        if (packageManager === 'pnpm') {
          // Check if pnpm is already installed
          const pnpmCheck = await runInProject(sandbox, 'which', ['pnpm'])
          if (!pnpmCheck.success) {
            await logger.info('Installing pnpm globally...')
            const pnpmGlobalInstall = await runInProject(sandbox, 'npm', ['install', '-g', 'pnpm'])
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
          const yarnCheck = await runInProject(sandbox, 'which', ['yarn'])
          if (!yarnCheck.success) {
            await logger.info('Installing yarn globally...')
            const yarnGlobalInstall = await runInProject(sandbox, 'npm', ['install', '-g', 'yarn'])
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
          await logger.info('Package manager failed, trying npm as fallback')

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
        const pipCheck = await runInProject(sandbox, 'python3', ['-m', 'pip', '--version'])

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
          const pipUpgrade = await runInProject(sandbox, 'python3', ['-m', 'pip', 'install', '--upgrade', 'pip'])

          if (!pipUpgrade.success) {
            await logger.info('Warning: Failed to upgrade pip, continuing anyway')
          } else {
            await logger.info('pip upgraded successfully')
          }
        }

        // Install dependencies from requirements.txt
        const pipInstall = await runInProject(sandbox, 'python3', ['-m', 'pip', 'install', '-r', 'requirements.txt'])

        if (!pipInstall.success) {
          await logger.info('pip install failed')
          await logger.info('pip install failed with exit code')

          if (pipInstall.output) await logger.info('pip stdout available')
          if (pipInstall.error) await logger.info('pip stderr available')

          // Don't throw error, just log it and continue
          await logger.info('Warning: Failed to install Python dependencies, but continuing with sandbox setup')
        } else {
          await logger.info('Python dependencies installed successfully')
        }
      } else {
        await logger.info('No package.json or requirements.txt found, skipping dependency installation')
      }
    } // End of installDependencies check

    // Auto-start dev server if package.json has a dev script
    let domain: string | undefined
    let devPort = 3000 // Default port

    if (packageJsonCheck.success && config.installDependencies) {
      // Check if package.json has a dev script
      const packageJsonRead = await runInProject(sandbox, 'cat', ['package.json'])
      if (packageJsonRead.success && packageJsonRead.output) {
        try {
          const packageJson = JSON.parse(packageJsonRead.output)
          const hasDevScript = packageJson?.scripts?.dev

          // Detect Vite projects (use port 5173)
          const hasVite = packageJson?.dependencies?.vite || packageJson?.devDependencies?.vite
          if (hasVite) {
            devPort = 5173
            await logger.info('Vite project detected, using port 5173')
          }

          if (hasDevScript) {
            await logger.info('Dev script detected, starting development server...')

            const packageManager = await detectPackageManager(sandbox, logger)
            let devCommand = packageManager === 'npm' ? 'npm' : packageManager
            let devArgs = packageManager === 'npm' ? ['run', 'dev'] : ['dev']

            // Check if Vite project and configure to allow all hosts
            if (hasVite) {
              await logger.info('Configuring Vite for sandbox environment')

              // Add vite.config.js to global gitignore FIRST so any modifications won't be committed
              await runCommandInSandbox(sandbox, 'sh', [
                '-c',
                'mkdir -p ~/.config/git && grep -q "^vite\\.config\\." ~/.gitignore_global 2>/dev/null || echo "vite.config.*" >> ~/.gitignore_global',
              ])
              await runInProject(sandbox, 'git', ['config', 'core.excludesfile', '~/.gitignore_global'])
              await logger.info('Added vite.config to global gitignore')

              // Now modify vite.config.js to set host: true (disables host checking)
              const hasViteConfigJs = await runInProject(sandbox, 'test', ['-f', 'vite.config.js'])

              if (hasViteConfigJs.success) {
                // Read and modify the config
                const configRead = await runInProject(sandbox, 'cat', ['vite.config.js'])
                if (configRead.success) {
                  let config = configRead.output || ''

                  // Simple sed replacement to set host: true in server config
                  // This disables Vite's host checking
                  await runInProject(sandbox, 'sh', [
                    '-c',
                    `
# Backup original
cp vite.config.js vite.config.js.backup

# Add host: true to server config using sed
if grep -q "server:" vite.config.js; then
  # Server section exists, add host: true
  sed -i "/server:[[:space:]]*{/a\\    host: true," vite.config.js
else
  # No server section, add it
  sed -i "/export default defineConfig/a\\  server: { host: true }," vite.config.js  
fi
`,
                  ])
                  await logger.info('Modified vite.config.js to disable host checking (globally ignored)')
                }
              }

              // Use standard dev command with --host flag
              if (packageManager === 'npm') {
                devArgs = ['run', 'dev', '--', '--host']
              } else {
                devArgs = ['dev', '--host']
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
            domain = sandbox.domain(devPort)
            await logger.info('Development server is running')
          }
        } catch (parseError) {
          // If package.json parsing fails, just continue without starting dev server
          await logger.info('Could not parse package.json, skipping auto-start of dev server')
        }
      }
    }

    // If domain wasn't set by dev server, get it now
    if (!domain) {
      domain = sandbox.domain(devPort)
    }

    // Log sandbox readiness based on project type
    if (packageJsonCheck.success) {
      await logger.info('Node.js project detected, sandbox ready for development')
      await logger.info('Sandbox available')
    } else if (requirementsTxtCheck.success) {
      await logger.info('Python project detected, sandbox ready for development')
      await logger.info('Sandbox available')

      // Check if there's a common Python web framework entry point
      const flaskAppCheck = await runInProject(sandbox, 'test', ['-f', 'app.py'])
      const djangoManageCheck = await runInProject(sandbox, 'test', ['-f', 'manage.py'])

      if (flaskAppCheck.success) {
        await logger.info('Flask app.py detected, you can run: python3 app.py')
      } else if (djangoManageCheck.success) {
        await logger.info('Django manage.py detected, you can run: python3 manage.py runserver')
      }
    } else {
      await logger.info('Project type not detected, sandbox ready for general development')
      await logger.info('Sandbox available')
    }

    // Check for cancellation before Git configuration
    if (config.onCancellationCheck && (await config.onCancellationCheck())) {
      await logger.info('Task was cancelled before Git configuration')
      return { success: false, cancelled: true }
    }

    // Install agent-browser if enabled
    if (config.enableBrowser) {
      await logger.info('Installing agent-browser for browser automation...')

      if (config.onProgress) {
        await config.onProgress(42, 'Installing browser dependencies...')
      }

      // Install system dependencies for Chromium (Fedora-based sandbox)
      await logger.info('Installing system dependencies for Chromium...')

      // Clean dnf cache first to avoid corruption issues
      await runCommandInSandbox(sandbox, 'sh', ['-c', 'sudo dnf clean all 2>&1'])

      // Critical packages for Chromium - install in groups to be resilient
      const criticalDeps = ['nss', 'nspr']
      const displayDeps = ['libxkbcommon', 'atk', 'at-spi2-atk', 'at-spi2-core']
      const xDeps = [
        'libXcomposite',
        'libXdamage',
        'libXrandr',
        'libXfixes',
        'libXcursor',
        'libXi',
        'libXtst',
        'libXScrnSaver',
        'libXext',
      ]
      const graphicsDeps = ['mesa-libgbm', 'libdrm', 'mesa-libGL', 'mesa-libEGL']
      const otherDeps = ['cups-libs', 'alsa-lib', 'pango', 'cairo', 'gtk3', 'dbus-libs']

      // Install critical deps first
      const criticalResult = await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        `sudo dnf install -y ${criticalDeps.join(' ')} 2>&1`,
      ])
      if (!criticalResult.success) {
        await runCommandInSandbox(sandbox, 'sh', [
          '-c',
          `sudo dnf install -y --allowerasing ${criticalDeps.join(' ')} 2>&1`,
        ])
      }

      // Install other deps with --skip-broken
      const allOtherDeps = [...displayDeps, ...xDeps, ...graphicsDeps, ...otherDeps]
      await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        `sudo dnf install -y --skip-broken ${allOtherDeps.join(' ')} 2>&1`,
      ])

      // Run ldconfig to update library cache
      await runCommandInSandbox(sandbox, 'sh', ['-c', 'sudo ldconfig 2>&1'])

      await logger.info('System dependencies installed')

      // Install agent-browser globally
      if (config.onProgress) {
        await config.onProgress(44, 'Installing agent-browser...')
      }

      const agentBrowserInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'agent-browser'])

      if (!agentBrowserInstall.success) {
        await logger.info('Warning: Failed to install agent-browser globally')
      } else {
        await logger.info('agent-browser installed globally')

        // Download Chromium for agent-browser
        await logger.info('Downloading Chromium for agent-browser...')
        const chromiumInstall = await runCommandInSandbox(sandbox, 'agent-browser', ['install'])

        if (!chromiumInstall.success) {
          await logger.info('Warning: Failed to download Chromium for agent-browser')
        } else {
          await logger.info('Chromium downloaded successfully for agent-browser')
        }

        // Create the agent-browser skill file based on the selected agent
        await logger.info('Creating agent-browser skill for coding agent...')

        const agentType = config.selectedAgent || 'claude'

        // Skill content with YAML front matter (Claude format)
        const claudeSkillContent = `---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Quick start

\`\`\`bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
\`\`\`

## Core workflow

1. Navigate: \`agent-browser open <url>\`
2. Snapshot: \`agent-browser snapshot -i\` (returns elements with refs like \`@e1\`, \`@e2\`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation
\`\`\`bash
agent-browser open <url>      # Navigate to URL
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser close           # Close browser
\`\`\`

### Snapshot (page analysis)
\`\`\`bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -c         # Compact output
\`\`\`

### Interactions (use @refs from snapshot)
\`\`\`bash
agent-browser click @e1           # Click
agent-browser fill @e2 "text"     # Clear and type
agent-browser type @e2 "text"     # Type without clearing
agent-browser press Enter         # Press key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser select @e1 "value"  # Select dropdown option
agent-browser scroll down 500     # Scroll page
agent-browser upload @e1 file.pdf # Upload files
\`\`\`

### Get information
\`\`\`bash
agent-browser get text @e1        # Get element text
agent-browser get value @e1       # Get input value
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
\`\`\`

### Screenshots
\`\`\`bash
agent-browser screenshot          # Screenshot to stdout
agent-browser screenshot path.png # Save to file
agent-browser screenshot --full   # Full page
\`\`\`

### Wait
\`\`\`bash
agent-browser wait @e1            # Wait for element
agent-browser wait 2000           # Wait milliseconds
\`\`\`

## Example: Form submission
\`\`\`bash
agent-browser open https://example.com/form
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait 2000
agent-browser snapshot -i  # Check result
\`\`\`
`

        // Generic instructions content (for agents without skill file support)
        const genericInstructions = `You have access to the agent-browser CLI for browser automation.

Quick start:
- agent-browser open <url>        # Navigate to page
- agent-browser snapshot -i       # Get interactive elements with refs
- agent-browser click @e1         # Click element by ref
- agent-browser fill @e2 "text"   # Fill input by ref

Workflow: open URL -> snapshot -i -> interact with @refs -> re-snapshot after changes

Key commands: open, snapshot -i, click, fill, type, press, get text/value/title/url, screenshot, wait`

        let skillInstalled = false

        if (agentType === 'claude') {
          // Claude: Use .claude/skills directory
          const skillDir = '/home/vercel-sandbox/.claude/skills/agent-browser'
          const createSkillDir = await runCommandInSandbox(sandbox, 'mkdir', ['-p', skillDir])
          if (createSkillDir.success) {
            const writeSkillCmd = `cat > ${skillDir}/SKILL.md << 'SKILL_EOF'
${claudeSkillContent}
SKILL_EOF`
            const writeSkill = await runCommandInSandbox(sandbox, 'sh', ['-c', writeSkillCmd])
            skillInstalled = writeSkill.success
          }
        } else if (agentType === 'gemini') {
          // Gemini: Use .gemini directory with AGENTS.md
          const geminiDir = '/home/vercel-sandbox/.gemini'
          const createDir = await runCommandInSandbox(sandbox, 'mkdir', ['-p', geminiDir])
          if (createDir.success) {
            const writeCmd = `cat > ${geminiDir}/AGENTS.md << 'SKILL_EOF'
# Browser Automation Skill

${genericInstructions}
SKILL_EOF`
            const writeSkill = await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])
            skillInstalled = writeSkill.success
          }
        } else if (agentType === 'cursor') {
          // Cursor: Use .cursor/rules directory
          const cursorDir = '/home/vercel-sandbox/.cursor/rules'
          const createDir = await runCommandInSandbox(sandbox, 'mkdir', ['-p', cursorDir])
          if (createDir.success) {
            const writeCmd = `cat > ${cursorDir}/agent-browser.mdc << 'SKILL_EOF'
---
description: Browser automation with agent-browser CLI
globs: ["**/*"]
alwaysApply: true
---

${genericInstructions}
SKILL_EOF`
            const writeSkill = await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])
            skillInstalled = writeSkill.success
          }
        } else if (agentType === 'codex') {
          // Codex: Use AGENTS.md in home directory
          const writeCmd = `cat > /home/vercel-sandbox/AGENTS.md << 'SKILL_EOF'
# Browser Automation

${genericInstructions}
SKILL_EOF`
          const writeSkill = await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])
          skillInstalled = writeSkill.success
        } else if (agentType === 'copilot') {
          // Copilot: Use .github/copilot-instructions.md
          const ghDir = '/home/vercel-sandbox/.github'
          const createDir = await runCommandInSandbox(sandbox, 'mkdir', ['-p', ghDir])
          if (createDir.success) {
            const writeCmd = `cat > ${ghDir}/copilot-instructions.md << 'SKILL_EOF'
# Browser Automation

${genericInstructions}
SKILL_EOF`
            const writeSkill = await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])
            skillInstalled = writeSkill.success
          }
        } else if (agentType === 'opencode') {
          // OpenCode: Use AGENTS.md in home directory
          const writeCmd = `cat > /home/vercel-sandbox/AGENTS.md << 'SKILL_EOF'
# Browser Automation

${genericInstructions}
SKILL_EOF`
          const writeSkill = await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])
          skillInstalled = writeSkill.success
        }

        if (skillInstalled) {
          await logger.info('agent-browser skill created successfully')
        } else {
          await logger.info('Warning: Failed to create agent-browser skill file')
        }
      }
    }

    // Configure Git user
    const gitName = config.gitAuthorName || 'Coding Agent'
    const gitEmail = config.gitAuthorEmail || 'agent@example.com'
    await runInProject(sandbox, 'git', ['config', 'user.name', gitName])
    await runInProject(sandbox, 'git', ['config', 'user.email', gitEmail])

    // Verify we're in a Git repository
    const gitRepoCheck = await runInProject(sandbox, 'git', ['rev-parse', '--git-dir'])
    if (!gitRepoCheck.success) {
      await logger.info('Not in a Git repository, initializing...')
      const gitInit = await runInProject(sandbox, 'git', ['init'])
      if (!gitInit.success) {
        throw new Error('Failed to initialize Git repository')
      }
      await logger.info('Git repository initialized')
    } else {
      await logger.info('Git repository detected')
    }

    // Check if repository is empty (no commits)
    const hasCommits = await runInProject(sandbox, 'git', ['rev-parse', 'HEAD'])
    if (!hasCommits.success) {
      await logger.info('Empty repository detected, creating initial main branch')

      // Extract repo name from repoUrl (e.g., https://github.com/owner/repo.git -> repo)
      const repoNameMatch = config.repoUrl.match(/\/([^\/]+?)(\.git)?$/)
      const repoName = repoNameMatch ? repoNameMatch[1] : 'repository'

      // Create README.md with repo name
      const readmeContent = `# ${repoName}\n`
      const createReadme = await runInProject(sandbox, 'sh', ['-c', `echo '${readmeContent}' > README.md`])

      if (!createReadme.success) {
        throw new Error('Failed to create initial README')
      }

      // Checkout to main branch (or create it if needed)
      const checkoutMain = await runInProject(sandbox, 'git', ['checkout', '-b', 'main'])
      if (!checkoutMain.success) {
        throw new Error('Failed to create main branch')
      }

      // Add README to git
      const gitAdd = await runInProject(sandbox, 'git', ['add', 'README.md'])
      if (!gitAdd.success) {
        throw new Error('Failed to add README to git')
      }

      // Commit README
      const gitCommit = await runInProject(sandbox, 'git', ['commit', '-m', 'Initial commit'])
      if (!gitCommit.success) {
        throw new Error('Failed to commit initial README')
      }

      await logger.info('Created initial commit on main branch')

      // Push to origin
      const gitPush = await runInProject(sandbox, 'git', ['push', '-u', 'origin', 'main'])
      if (!gitPush.success) {
        await logger.info('Failed to push main branch to origin')
        // Don't throw error here as local repo is still valid
      } else {
        await logger.info('Pushed main branch to origin')
      }
    }

    let branchName: string

    if (config.preDeterminedBranchName) {
      // Use the AI-generated branch name
      await logger.info('Using pre-determined branch name')

      // First check if the branch already exists locally
      const branchExistsLocal = await runInProject(sandbox, 'git', [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${config.preDeterminedBranchName}`,
      ])

      if (branchExistsLocal.success) {
        // Branch exists locally, just check it out
        await logger.info('Branch already exists locally, checking it out')
        const checkoutBranch = await runAndLogCommand(
          sandbox,
          'git',
          ['checkout', config.preDeterminedBranchName],
          logger,
          PROJECT_DIR,
        )

        if (!checkoutBranch.success) {
          await logger.info('Failed to checkout existing branch')
          throw new Error('Failed to checkout Git branch')
        }

        branchName = config.preDeterminedBranchName
      } else {
        // Check if branch exists on remote
        const branchExistsRemote = await runInProject(sandbox, 'git', [
          'ls-remote',
          '--heads',
          'origin',
          config.preDeterminedBranchName,
        ])

        if (branchExistsRemote.success && branchExistsRemote.output?.trim()) {
          // Branch exists on remote, fetch and check it out
          await logger.info('Branch exists on remote, fetching and checking it out')

          // Fetch the remote branch with refspec to create local tracking branch
          const fetchBranch = await runInProject(sandbox, 'git', [
            'fetch',
            'origin',
            `${config.preDeterminedBranchName}:${config.preDeterminedBranchName}`,
          ])

          if (!fetchBranch.success) {
            await logger.info('Failed to fetch remote branch, trying alternative method')

            // Alternative: fetch all and then checkout
            const fetchAll = await runInProject(sandbox, 'git', ['fetch', 'origin'])
            if (!fetchAll.success) {
              await logger.info('Failed to fetch from origin')
              throw new Error('Failed to fetch from remote Git repository')
            }

            // Create local branch tracking remote
            const checkoutTracking = await runAndLogCommand(
              sandbox,
              'git',
              ['checkout', '-b', config.preDeterminedBranchName, '--track', `origin/${config.preDeterminedBranchName}`],
              logger,
              PROJECT_DIR,
            )

            if (!checkoutTracking.success) {
              await logger.info('Failed to checkout and track remote branch')
              throw new Error('Failed to checkout remote Git branch')
            }
          } else {
            // Successfully fetched, now checkout
            const checkoutRemoteBranch = await runAndLogCommand(
              sandbox,
              'git',
              ['checkout', config.preDeterminedBranchName],
              logger,
              PROJECT_DIR,
            )

            if (!checkoutRemoteBranch.success) {
              await logger.info('Failed to checkout remote branch')
              throw new Error('Failed to checkout remote Git branch')
            }
          }

          branchName = config.preDeterminedBranchName
        } else {
          // Branch doesn't exist, create it
          await logger.info('Creating new branch')
          const createBranch = await runAndLogCommand(
            sandbox,
            'git',
            ['checkout', '-b', config.preDeterminedBranchName],
            logger,
            PROJECT_DIR,
          )

          if (!createBranch.success) {
            await logger.info('Failed to create branch')
            // Add debugging information
            const gitStatus = await runInProject(sandbox, 'git', ['status'])
            await logger.info('Git status retrieved')
            const gitBranch = await runInProject(sandbox, 'git', ['branch', '-a'])
            await logger.info('Git branches retrieved')
            throw new Error('Failed to create Git branch')
          }

          await logger.info('Successfully created branch')
          branchName = config.preDeterminedBranchName
        }
      }
    } else {
      // Fallback: Create a timestamp-based branch name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const suffix = generateId()
      branchName = `agent/${timestamp}-${suffix}`

      await logger.info('No predetermined branch name, using timestamp-based branch')
      const createBranch = await runAndLogCommand(sandbox, 'git', ['checkout', '-b', branchName], logger, PROJECT_DIR)

      if (!createBranch.success) {
        await logger.info('Failed to create branch')
        // Add debugging information for fallback branch creation too
        const gitStatus = await runInProject(sandbox, 'git', ['status'])
        await logger.info('Git status retrieved')
        const gitBranch = await runInProject(sandbox, 'git', ['branch', '-a'])
        await logger.info('Git branches retrieved')
        const gitLog = await runInProject(sandbox, 'git', ['log', '--oneline', '-5'])
        await logger.info('Recent commits retrieved')
        throw new Error('Failed to create Git branch')
      }

      await logger.info('Successfully created fallback branch')
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
    await logger.error('Error occurred during sandbox creation')

    return {
      success: false,
      error: errorMessage || 'Failed to create sandbox',
    }
  }
}
