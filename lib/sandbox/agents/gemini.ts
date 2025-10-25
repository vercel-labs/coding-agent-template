import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors } from '@/lib/db/schema'

type Connector = typeof connectors.$inferSelect

// Helper function to run command and log it in project directory
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  await logger.command(redactedCommand)

  const result = await runInProject(sandbox, command, args)

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
      await logger.info('Configuring MCP servers')

      // Create Gemini settings.json configuration file
      const settingsConfig: {
        mcpServers: Record<
          string,
          | { httpUrl: string; headers?: Record<string, string> }
          | { command: string; args?: string[]; env?: Record<string, string> }
        >
      } = {
        mcpServers: {},
      }

      for (const server of mcpServers) {
        const serverName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

        if (server.type === 'local') {
          // Local STDIO server - parse command string into command and args
          const commandParts = server.command!.trim().split(/\s+/)
          const executable = commandParts[0]
          const args = commandParts.slice(1)

          // Parse env from JSON string if present
          let envObject: Record<string, string> | undefined
          if (server.env) {
            try {
              envObject = JSON.parse(server.env)
            } catch (e) {
              await logger.info('Warning: Failed to parse env for MCP server')
            }
          }

          settingsConfig.mcpServers[serverName] = {
            command: executable,
            ...(args.length > 0 ? { args } : {}),
            ...(envObject ? { env: envObject } : {}),
          }
          await logger.info('Added local MCP server')
        } else {
          // Remote HTTP server
          settingsConfig.mcpServers[serverName] = {
            httpUrl: server.baseUrl!,
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
            settingsConfig.mcpServers[serverName].headers = headers
          }

          await logger.info('Added remote MCP server')
        }
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
      await logger.info('Using selected model')
    }

    // Use YOLO mode to auto-approve all tools (bypass approval prompts)
    args.push('--yolo')

    // Add output format for structured responses
    args.push('-o', 'json')

    // Don't add instruction to args array - we'll add it quoted separately to the command string

    // Log what we're trying to do
    await logger.info('Executing Gemini CLI with authentication')
    const redactedCommand = `gemini ${args.join(' ')} "${instruction.substring(0, 100)}..."`
    await logger.command(redactedCommand)

    // Build environment variables string for shell command (like other agents)
    const envPrefix = Object.entries(authEnv)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')

    // Try a simpler approach first - use gemini without complex flags
    await logger.info('Attempting Gemini CLI execution with basic flags...')

    // Execute Gemini CLI with proper environment using shell command
    // IMPORTANT: Wrap instruction in quotes to prevent CLI option parsing issues
    const fullCommand = envPrefix
      ? `${envPrefix} gemini ${args.join(' ')} "${instruction}"`
      : `gemini ${args.join(' ')} "${instruction}"`
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
      // Don't add instruction to array - add it quoted separately

      const fallbackCommand = envPrefix
        ? `${envPrefix} gemini ${fallbackArgs.join(' ')} "${instruction}"`
        : `gemini ${fallbackArgs.join(' ')} "${instruction}"`
      result = await runCommandInSandbox(sandbox, 'sh', ['-c', fallbackCommand])

      // If still failing, try the most basic approach
      if (!result.success && result.error?.includes('Tool') && result.error?.includes('not found in registry')) {
        await logger.info('Retrying with minimal flags...')
        const minimalArgs = selectedModel ? ['-m', selectedModel] : []
        const minimalCommand = envPrefix
          ? `${envPrefix} gemini ${minimalArgs.join(' ')} "${instruction}"`
          : `gemini ${minimalArgs.join(' ')} "${instruction}"`
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
    await logger.info('Gemini CLI execution completed')
    if (result.output) {
      await logger.info('Gemini CLI output available')
    }
    if (result.error) {
      await logger.error('Gemini CLI error occurred')
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
