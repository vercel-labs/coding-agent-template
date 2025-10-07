import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors } from '@/lib/db/schema'

type Connector = typeof connectors.$inferSelect

// Helper function to run command and log it
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  await logger.command(redactedCommand)

  const result = await runCommandInSandbox(sandbox, command, args)

  // Only try to access properties if result is valid
  if (result && result.output && result.output.trim()) {
    const redactedOutput = redactSensitiveInfo(result.output.trim())
    await logger.info(redactedOutput)
  }

  if (result && !result.success && result.error) {
    const redactedError = redactSensitiveInfo(result.error)
    await logger.error(redactedError)
  }

  // If result is null/undefined, create a fallback result
  if (!result) {
    const errorResult = {
      success: false,
      error: 'Command execution failed - no result returned',
      exitCode: -1,
      output: '',
      command: redactedCommand,
    }
    await logger.error('Command execution failed - no result returned')
    return errorResult
  }

  return result
}

export async function executeOpenCodeInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
): Promise<AgentExecutionResult> {
  try {
    // Executing OpenCode with instruction
    await logger.info('Starting OpenCode agent execution...')

    // Check if we have required environment variables for OpenCode
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      const errorMsg = 'OpenAI API key or Anthropic API key is required for OpenCode agent'
      await logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        cliName: 'opencode',
        changesDetected: false,
      }
    }

    // Install OpenCode using the official npm package
    // Installing OpenCode CLI
    if (logger) {
      await logger.info('Installing OpenCode CLI...')
    }

    const installResult = await runAndLogCommand(sandbox, 'npm', ['install', '-g', 'opencode-ai'], logger)

    if (!installResult.success) {
      console.error('OpenCode CLI installation failed:', { error: installResult.error })
      return {
        success: false,
        error: `Failed to install OpenCode CLI: ${installResult.error || 'Unknown error'}`,
        cliName: 'opencode',
        changesDetected: false,
      }
    }

    console.log('OpenCode CLI installed successfully')
    if (logger) {
      await logger.success('OpenCode CLI installed successfully')
    }

    // Verify OpenCode CLI is available
    const cliCheck = await runAndLogCommand(sandbox, 'opencode', ['--version'], logger)

    if (!cliCheck.success) {
      // Try to find the exact path where npm installed it
      const npmBinCheck = await runAndLogCommand(sandbox, 'npm', ['bin', '-g'], logger)

      if (npmBinCheck.success && npmBinCheck.output) {
        const globalBinPath = npmBinCheck.output.trim()
        console.log(`Global npm bin path: ${globalBinPath}`)

        // Try running opencode from the global bin path
        const directPathCheck = await runAndLogCommand(
          sandbox,
          `${globalBinPath}/opencode`,
          ['--version'],

          logger,
        )

        if (!directPathCheck.success) {
          return {
            success: false,
            error: `OpenCode CLI not found after installation. Tried both 'opencode' and '${globalBinPath}/opencode'. Installation may have failed.`,
            cliName: 'opencode',
            changesDetected: false,
          }
        }
      } else {
        return {
          success: false,
          error: 'OpenCode CLI not found after installation and could not determine npm global bin path.',
          cliName: 'opencode',
          changesDetected: false,
        }
      }
    }

    console.log('OpenCode CLI verified successfully')
    if (logger) {
      await logger.success('OpenCode CLI verified successfully')
    }

    // Configure MCP servers if provided
    if (mcpServers && mcpServers.length > 0) {
      await logger.info(`Configuring ${mcpServers.length} MCP servers: ${mcpServers.map((s) => s.name).join(', ')}`)

      // Create OpenCode opencode.json configuration file
      const opencodeConfig: {
        $schema: string
        mcp: Record<
          string,
          | { type: 'local'; command: string[]; enabled: boolean; environment?: Record<string, string> }
          | { type: 'remote'; url: string; enabled: boolean; headers?: Record<string, string> }
        >
      } = {
        $schema: 'https://opencode.ai/config.json',
        mcp: {},
      }

      for (const server of mcpServers) {
        const serverName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

        if (server.type === 'local') {
          // Local MCP server - parse command string into executable and args
          const commandParts = server.command!.trim().split(/\s+/)

          opencodeConfig.mcp[serverName] = {
            type: 'local',
            command: commandParts,
            enabled: true,
            ...(server.env ? { environment: server.env } : {}),
          }

          await logger.info(`Added local MCP server: ${server.name} (${server.command})`)
        } else {
          // Remote MCP server
          opencodeConfig.mcp[serverName] = {
            type: 'remote',
            url: server.baseUrl!,
            enabled: true,
          }

          // Build headers object
          const headers: Record<string, string> = {}
          if (server.oauthClientSecret) {
            headers.Authorization = `Bearer ${server.oauthClientSecret}`
          }
          if (server.oauthClientId) {
            headers['X-Client-ID'] = server.oauthClientId
          }
          if (Object.keys(headers).length > 0) {
            opencodeConfig.mcp[serverName].headers = headers
          }

          await logger.info(`Added remote MCP server: ${server.name} (${server.baseUrl})`)
        }
      }

      // Write the opencode.json file to the OpenCode config directory (not project directory)
      const opencodeConfigJson = JSON.stringify(opencodeConfig, null, 2)
      const createConfigCmd = `mkdir -p ~/.opencode && cat > ~/.opencode/config.json << 'EOF'
${opencodeConfigJson}
EOF`

      await logger.info('Creating OpenCode MCP configuration file...')
      const configResult = await runCommandInSandbox(sandbox, 'sh', ['-c', createConfigCmd])

      if (configResult.success) {
        await logger.info('OpenCode configuration file (~/.opencode/config.json) created successfully')

        // Verify the file was created (without logging sensitive contents)
        const verifyConfig = await runCommandInSandbox(sandbox, 'test', ['-f', '~/.opencode/config.json'])
        if (verifyConfig.success) {
          await logger.info('OpenCode MCP configuration verified')
        }
      } else {
        await logger.info('Warning: Failed to create OpenCode configuration file')
      }
    }

    // Set up authentication for OpenCode
    // OpenCode supports multiple providers, we'll configure the available ones
    const authSetupCommands: string[] = []

    if (process.env.OPENAI_API_KEY) {
      console.log('Configuring OpenAI provider...')
      if (logger) {
        await logger.info('Configuring OpenAI provider...')
      }

      // Use opencode auth to configure OpenAI
      const openaiAuthResult = await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        `echo "${process.env.OPENAI_API_KEY}" | opencode auth add openai`,
      ])

      if (!openaiAuthResult.success) {
        console.warn('Failed to configure OpenAI provider, but continuing...')
        if (logger) {
          await logger.info('Failed to configure OpenAI provider, but continuing...')
        }
      } else {
        authSetupCommands.push('OpenAI provider configured')
      }
    }

    if (process.env.ANTHROPIC_API_KEY) {
      console.log('Configuring Anthropic provider...')
      if (logger) {
        await logger.info('Configuring Anthropic provider...')
      }

      // Use opencode auth to configure Anthropic
      const anthropicAuthResult = await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        `echo "${process.env.ANTHROPIC_API_KEY}" | opencode auth add anthropic`,
      ])

      if (!anthropicAuthResult.success) {
        console.warn('Failed to configure Anthropic provider, but continuing...')
        if (logger) {
          await logger.info('Failed to configure Anthropic provider, but continuing...')
        }
      } else {
        authSetupCommands.push('Anthropic provider configured')
      }
    }

    // Initialize OpenCode for the project
    console.log('Initializing OpenCode for the project...')
    if (logger) {
      await logger.info('Initializing OpenCode for the project...')
    }

    // Determine the correct command to use (handle cases where npm global bin path is needed)
    let opencodeCmdToUse = 'opencode'

    if (!cliCheck.success) {
      const npmBinResult = await runAndLogCommand(sandbox, 'npm', ['bin', '-g'], logger)
      if (npmBinResult.success && npmBinResult.output) {
        const globalBinPath = npmBinResult.output.trim()
        opencodeCmdToUse = `${globalBinPath}/opencode`
      }
    }

    // Set up environment variables for the OpenCode execution
    const envVars: Record<string, string> = {}

    if (process.env.OPENAI_API_KEY) {
      envVars.OPENAI_API_KEY = process.env.OPENAI_API_KEY
    }
    if (process.env.ANTHROPIC_API_KEY) {
      envVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    }

    // Build environment variables string for shell command
    const envPrefix = Object.entries(envVars)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')

    console.log('Executing OpenCode using the run command for non-interactive mode...')
    if (logger) {
      await logger.info('Executing OpenCode run command in non-interactive mode...')
      if (selectedModel) {
        await logger.info(`Using selected model: ${selectedModel}`)
      }
    }

    // Use the 'opencode run' command for non-interactive execution as documented at https://opencode.ai/docs/cli/
    // This command allows us to pass a prompt directly and get results without the TUI
    // Add model parameter if provided
    const modelFlag = selectedModel ? ` --model "${selectedModel}"` : ''
    const fullCommand = `${envPrefix} ${opencodeCmdToUse} run${modelFlag} "${instruction}"`

    // Log the command we're about to execute (with redacted API keys)
    const redactedCommand = fullCommand.replace(/API_KEY="[^"]*"/g, 'API_KEY="[REDACTED]"')
    await logger.command(redactedCommand)
    if (logger) {
      await logger.command(redactedCommand)
    }

    // Execute OpenCode run command
    const executeResult = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

    const stdout = executeResult.output || ''
    const stderr = executeResult.error || ''

    // Log the output
    if (stdout && stdout.trim()) {
      await logger.info(redactSensitiveInfo(stdout.trim()))
      if (logger) {
        await logger.info(redactSensitiveInfo(stdout.trim()))
      }
    }
    if (stderr && stderr.trim()) {
      await logger.error(redactSensitiveInfo(stderr.trim()))
      if (logger) {
        await logger.error(redactSensitiveInfo(stderr.trim()))
      }
    }

    // OpenCode execution completed

    // Check if any files were modified by OpenCode
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    if (executeResult.success || executeResult.exitCode === 0) {
      const successMsg = `OpenCode executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`
      if (logger) {
        await logger.success(successMsg)
      }

      // If there are changes, log what was changed
      if (hasChanges) {
        console.log('OpenCode made changes to files:', hasChanges)
        if (logger) {
          await logger.info(`Files changed: ${hasChanges}`)
        }
      }

      return {
        success: true,
        output: successMsg,
        agentResponse: stdout || 'OpenCode completed the task',
        cliName: 'opencode',
        changesDetected: !!hasChanges,
        error: undefined,
      }
    } else {
      const errorMsg = `OpenCode failed (exit code ${executeResult.exitCode}): ${stderr || stdout || 'No error message'}`
      if (logger) {
        await logger.error(errorMsg)
      }

      return {
        success: false,
        error: errorMsg,
        agentResponse: stdout,
        cliName: 'opencode',
        changesDetected: !!hasChanges,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute OpenCode in sandbox'
    console.error('OpenCode execution error:', error)

    if (logger) {
      await logger.error(errorMessage)
    }

    return {
      success: false,
      error: errorMessage,
      cliName: 'opencode',
      changesDetected: false,
    }
  }
}
