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

export async function executeGeminiInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
): Promise<AgentExecutionResult> {
  try {
    // Executing Gemini CLI with instruction

    // Check if Gemini CLI is available
    const cliCheck = await runAndLogCommand(sandbox, 'which', ['gemini'], logger)

    if (!cliCheck.success) {
      // Gemini CLI not found, try to install it
      await logger.info('Gemini CLI not found, installing...')

      // Install Gemini CLI using npm
      const installResult = await runAndLogCommand(sandbox, 'npm', ['install', '-g', '@google/gemini-cli'], logger)

      if (!installResult.success) {
        return {
          success: false,
          error: `Failed to install Gemini CLI: ${installResult.error}`,
          cliName: 'gemini',
          changesDetected: false,
        }
      }

      await logger.info('Gemini CLI installed successfully')

      // Verify installation worked
      const verifyCheck = await runAndLogCommand(sandbox, 'which', ['gemini'], logger)
      if (!verifyCheck.success) {
        return {
          success: false,
          error: 'Gemini CLI installation completed but CLI still not found',
          cliName: 'gemini',
          changesDetected: false,
        }
      }
    }

    // Configure MCP servers if provided
    if (mcpServers && mcpServers.length > 0) {
      await logger.info(`Configuring ${mcpServers.length} MCP servers: ${mcpServers.map((s) => s.name).join(', ')}`)

      // Create Gemini settings.json configuration file
      const settingsConfig: Record<string, any> = {
        mcpServers: {},
      }

      for (const server of mcpServers) {
        const serverName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

        // Configure as remote HTTP server
        settingsConfig.mcpServers[serverName] = {
          httpUrl: server.baseUrl,
        }

        // Add Authorization header if authentication is provided
        if (server.oauthClientSecret) {
          settingsConfig.mcpServers[serverName].headers = {
            Authorization: `Bearer ${server.oauthClientSecret}`,
          }
        }

        // Add additional headers if client ID is provided
        if (server.oauthClientId) {
          if (!settingsConfig.mcpServers[serverName].headers) {
            settingsConfig.mcpServers[serverName].headers = {}
          }
          settingsConfig.mcpServers[serverName].headers['X-Client-ID'] = server.oauthClientId
        }

        await logger.info(`Added MCP server configuration: ${server.name} (${server.baseUrl})`)
      }

      // Write the settings.json file to ~/.gemini/
      const settingsJson = JSON.stringify(settingsConfig, null, 2)
      const createSettingsCmd = `mkdir -p ~/.gemini && cat > ~/.gemini/settings.json << 'EOF'
${settingsJson}
EOF`

      await logger.info('Creating Gemini MCP settings file...')
      const settingsResult = await runCommandInSandbox(sandbox, 'sh', ['-c', createSettingsCmd])

      if (settingsResult.success) {
        await logger.info('Gemini settings.json file created successfully')

        // Verify the file was created (without logging sensitive contents)
        const verifySettings = await runCommandInSandbox(sandbox, 'test', ['-f', '~/.gemini/settings.json'])
        if (verifySettings.success) {
          await logger.info('Gemini MCP configuration verified')
        }
      } else {
        await logger.info('Warning: Failed to create Gemini settings.json file')
      }
    }

    // Check authentication options in order of preference
    let authMethod = 'none'
    const authEnv: Record<string, string> = {}

    // Option 1: Check for GEMINI_API_KEY (Gemini API)
    if (process.env.GEMINI_API_KEY) {
      authMethod = 'api_key'
      authEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY
      await logger.info('Using Gemini API key authentication')
    }
    // Option 2: Check for GOOGLE_API_KEY with Vertex AI flag (Vertex AI)
    else if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_GENAI_USE_VERTEXAI) {
      authMethod = 'vertex_ai'
      authEnv.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
      authEnv.GOOGLE_GENAI_USE_VERTEXAI = 'true'
      await logger.info('Using Vertex AI authentication')
    }
    // Option 3: Check for Google Cloud Project (OAuth with Code Assist)
    else if (process.env.GOOGLE_CLOUD_PROJECT) {
      authMethod = 'oauth_project'
      authEnv.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT
      await logger.info('Using Google Cloud Project authentication (requires OAuth login)')
    }
    // Option 4: Default OAuth (will require interactive login)
    else {
      authMethod = 'oauth'
      await logger.info('No API keys found, will attempt OAuth authentication')
    }

    // Prepare the command arguments using the correct Gemini CLI syntax
    const args = []

    // Add model selection if provided
    if (selectedModel) {
      args.push('-m', selectedModel)
      await logger.info(`Using model: ${selectedModel}`)
    }

    // Use YOLO mode to auto-approve all tools (bypass approval prompts)
    args.push('--yolo')

    // Add output format for structured responses
    args.push('-o', 'json')

    // Add the instruction as positional argument (not using deprecated -p flag)
    args.push(instruction)

    // Log what we're trying to do
    await logger.info(`Executing Gemini CLI with ${authMethod} authentication`)
    const redactedCommand = `gemini ${args.slice(0, -1).join(' ')} "${instruction.substring(0, 100)}..."`
    await logger.command(redactedCommand)

    // Build environment variables string for shell command (like other agents)
    const envPrefix = Object.entries(authEnv)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')

    // Try a simpler approach first - use gemini without complex flags
    await logger.info('Attempting Gemini CLI execution with basic flags...')

    // Execute Gemini CLI with proper environment using shell command
    const fullCommand = envPrefix ? `${envPrefix} gemini ${args.join(' ')}` : `gemini ${args.join(' ')}`
    let result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

    // If that fails with tool registry error, try with different approval modes
    if (!result.success && result.error?.includes('Tool') && result.error?.includes('not found in registry')) {
      await logger.info('Retrying with auto_edit approval mode...')
      const fallbackArgs = []
      if (selectedModel) {
        fallbackArgs.push('-m', selectedModel)
      }
      fallbackArgs.push('--approval-mode', 'auto_edit') // Auto-approve edit tools only
      fallbackArgs.push('-o', 'text') // Use text output instead of JSON
      fallbackArgs.push(instruction)

      const fallbackCommand = envPrefix
        ? `${envPrefix} gemini ${fallbackArgs.join(' ')}`
        : `gemini ${fallbackArgs.join(' ')}`
      result = await runCommandInSandbox(sandbox, 'sh', ['-c', fallbackCommand])

      // If still failing, try the most basic approach
      if (!result.success && result.error?.includes('Tool') && result.error?.includes('not found in registry')) {
        await logger.info('Retrying with minimal flags...')
        const minimalArgs = selectedModel ? ['-m', selectedModel, instruction] : [instruction]
        const minimalCommand = envPrefix
          ? `${envPrefix} gemini ${minimalArgs.join(' ')}`
          : `gemini ${minimalArgs.join(' ')}`
        result = await runCommandInSandbox(sandbox, 'sh', ['-c', minimalCommand])
      }
    }

    // Check if result is valid before accessing properties
    if (!result) {
      const errorMsg = 'Gemini CLI execution failed - no result returned'
      await logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        cliName: 'gemini',
        changesDetected: false,
      }
    }

    // Log the output
    if (result.output && result.output.trim()) {
      const redactedOutput = redactSensitiveInfo(result.output.trim())
      await logger.info(redactedOutput)
    }

    if (!result.success && result.error) {
      const redactedError = redactSensitiveInfo(result.error)
      await logger.error(redactedError)
    }

    // Log more details for debugging
    await logger.info(`Gemini CLI exit code: ${result.exitCode}`)
    if (result.output) {
      await logger.info(`Gemini CLI output length: ${result.output.length} characters`)
    }
    if (result.error) {
      await logger.error(`Gemini CLI error: ${result.error}`)
    }

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    if (result.success || result.exitCode === 0) {
      // Log additional debugging info if no changes were made
      if (!hasChanges) {
        await logger.info('No changes detected. Checking if files exist...')
        // Check if common files exist
        await runAndLogCommand(sandbox, 'find', ['.', '-name', 'README*', '-o', '-name', 'readme*'], logger)
        await runAndLogCommand(sandbox, 'ls', ['-la'], logger)
      }

      return {
        success: true,
        output: `Gemini CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
        agentResponse: result.output || 'No detailed response available',
        cliName: 'gemini',
        changesDetected: !!hasChanges,
        error: undefined,
      }
    } else {
      // Handle specific error types
      if (result.error?.includes('authentication') || result.error?.includes('login')) {
        return {
          success: false,
          error: `Gemini CLI authentication failed. Please set GEMINI_API_KEY, GOOGLE_API_KEY (with GOOGLE_GENAI_USE_VERTEXAI=true), or GOOGLE_CLOUD_PROJECT environment variable. Error: ${result.error}`,
          agentResponse: result.output,
          cliName: 'gemini',
          changesDetected: !!hasChanges,
        }
      }

      // Handle tool registry errors (common in sandbox environments)
      if (result.error?.includes('Tool') && result.error?.includes('not found in registry')) {
        return {
          success: false,
          error: `Gemini CLI tool registry error - this may be due to sandbox environment limitations. The Gemini CLI may have restricted file operation capabilities in this environment. Consider using a different agent for file modifications. Error: ${result.error}`,
          agentResponse: result.output,
          cliName: 'gemini',
          changesDetected: !!hasChanges,
        }
      }

      return {
        success: false,
        error: `Gemini CLI failed (exit code ${result.exitCode}): ${result.error || 'No error message'}`,
        agentResponse: result.output,
        cliName: 'gemini',
        changesDetected: !!hasChanges,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute Gemini CLI in sandbox'
    return {
      success: false,
      error: errorMessage,
      cliName: 'gemini',
      changesDetected: false,
    }
  }
}
