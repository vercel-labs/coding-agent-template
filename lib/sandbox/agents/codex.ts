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
  await logger.command(redactSensitiveInfo(fullCommand))

  const result = await runCommandInSandbox(sandbox, command, args)

  if (result.output && result.output.trim()) {
    await logger.info(redactSensitiveInfo(result.output.trim()))
  }

  if (!result.success && result.error) {
    await logger.error(redactSensitiveInfo(result.error))
  }

  return result
}

export async function executeCodexInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
): Promise<AgentExecutionResult> {
  try {
    // Executing Codex CLI with instruction

    // Install Codex CLI using npm
    // Installing Codex CLI
    const installResult = await runAndLogCommand(sandbox, 'npm', ['install', '-g', '@openai/codex'], logger)

    if (!installResult.success) {
      return {
        success: false,
        error: `Failed to install Codex CLI: ${installResult.error}`,
        cliName: 'codex',
        changesDetected: false,
      }
    }

    // Codex CLI installed successfully

    // Check if Codex CLI is available
    const cliCheck = await runAndLogCommand(sandbox, 'which', ['codex'], logger)

    if (!cliCheck.success) {
      return {
        success: false,
        error: 'Codex CLI not found after installation. Please ensure it is properly installed.',
        cliName: 'codex',
        changesDetected: false,
      }
    }

    // Set up authentication - we'll use API key method since we're in a sandbox
    if (!process.env.AI_GATEWAY_API_KEY) {
      return {
        success: false,
        error: 'AI Gateway API key not found. Please set AI_GATEWAY_API_KEY environment variable.',
        cliName: 'codex',
        changesDetected: false,
      }
    }

    // Validate API key format - can be either OpenAI (sk-) or Vercel (vck_)
    const apiKey = process.env.AI_GATEWAY_API_KEY
    const isOpenAIKey = apiKey?.startsWith('sk-')
    const isVercelKey = apiKey?.startsWith('vck_')

    if (!apiKey || (!isOpenAIKey && !isVercelKey)) {
      const errorMsg = `Invalid API key format. Expected to start with "sk-" (OpenAI) or "vck_" (Vercel), but got: "${apiKey?.substring(0, 15) || 'undefined'}"`

      if (logger) {
        await logger.error(errorMsg)
      }
      return {
        success: false,
        error: errorMsg,
        cliName: 'codex',
        changesDetected: false,
      }
    }

    if (logger) {
      const keyType = isVercelKey ? 'Vercel AI Gateway' : 'OpenAI'
      await logger.info(`Using ${keyType} API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`)
    }

    // According to the official Codex CLI docs, we should use 'exec' for non-interactive execution
    // The correct syntax is: codex exec "instruction"
    // We can also specify model with --model flag
    // For API key authentication in sandbox, we need to set the OPENAI_API_KEY environment variable

    // First, try to configure the CLI to use API key authentication
    // According to the docs, we can use API key but it requires additional setup
    if (logger) {
      await logger.info('Setting up Codex CLI authentication with API key...')
    }

    // According to the docs, we need to set up authentication properly
    // Try to configure the CLI with proper authentication and approval mode
    if (logger) {
      await logger.info('Configuring Codex CLI for API key authentication...')
    }

    // Based on research, the CLI might have ZDR (Zero Data Retention) limitations
    // or require specific authentication setup. Let's try a more comprehensive approach

    // First, check if we can get version info
    const versionTestResult = await sandbox.runCommand({
      cmd: 'codex',
      args: ['--version'],
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
        HOME: '/home/vercel-sandbox',
      },
      sudo: false,
    })

    if (logger) {
      await logger.info(`Codex CLI version test: ${versionTestResult.exitCode === 0 ? 'SUCCESS' : 'FAILED'}`)
    }

    // Create configuration file based on API key type
    // Use selectedModel if provided, otherwise fall back to default
    const modelToUse = selectedModel || 'openai/gpt-4o'
    let configToml
    if (isVercelKey) {
      // Use Vercel AI Gateway configuration for vck_ keys
      // Based on the curl example, it uses /chat/completions endpoint, not responses
      configToml = `model = "${modelToUse}"
model_provider = "vercel-ai-gateway"

[model_providers.vercel-ai-gateway]
name = "Vercel AI Gateway"
base_url = "https://ai-gateway.vercel.sh/v1"
env_key = "AI_GATEWAY_API_KEY"
wire_api = "chat"

# Debug settings
[debug]
log_requests = true
`
    } else {
      // Use OpenAI direct for sk_ keys
      configToml = `model = "${modelToUse}"
model_provider = "openai"

[model_providers.openai]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
env_key = "AI_GATEWAY_API_KEY"
wire_api = "responses"

# Debug settings
[debug]
log_requests = true
`
    }

    // Add MCP servers configuration if provided
    if (mcpServers && mcpServers.length > 0) {
      await logger.info(`Configuring ${mcpServers.length} MCP servers: ${mcpServers.map((s) => s.name).join(', ')}`)

      // Enable experimental RMCP client for streamable HTTP support
      configToml = `experimental_use_rmcp_client = true\n\n` + configToml

      for (const server of mcpServers) {
        const serverName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

        configToml += `
[mcp_servers.${serverName}]
url = "${server.baseUrl}"
`

        // Add bearer token if available (using oauthClientSecret)
        if (server.oauthClientSecret) {
          configToml += `bearer_token = "${server.oauthClientSecret}"
`
        }

        await logger.info(`Added MCP server configuration: ${server.name} (${server.baseUrl})`)
      }
    }

    if (logger) {
      await logger.info('Creating Codex configuration file...')
    }

    const configSetupResult = await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', `mkdir -p ~/.codex && cat > ~/.codex/config.toml << 'EOF'\n${configToml}EOF`],
      env: {},
      sudo: false,
    })

    if (logger) {
      await logger.info(`Codex config setup: ${configSetupResult.exitCode === 0 ? 'SUCCESS' : 'FAILED'}`)
    }

    // Debug: Check if the config file was created correctly (without logging sensitive contents)
    const configCheckResult = await sandbox.runCommand({
      cmd: 'test',
      args: ['-f', '~/.codex/config.toml'],
      env: { HOME: '/home/vercel-sandbox' },
      sudo: false,
    })

    if (logger && configCheckResult.exitCode === 0) {
      await logger.info('Config file verified')
    }

    // Debug: List files in the current directory before running Codex
    const lsDebugResult = await runCommandInSandbox(sandbox, 'ls', ['-la'])
    if (logger) {
      await logger.info(`Current directory contents:\n${lsDebugResult.output || 'No output from ls -la'}`)
    }

    // Debug: Show current working directory
    const pwdResult = await runCommandInSandbox(sandbox, 'pwd', [])
    if (logger) {
      await logger.info(`Current working directory: ${pwdResult.output || 'Unknown'}`)
    }

    // Use exec command with Vercel AI Gateway configuration
    // The model is now configured in config.toml, so we can use it directly
    // Use --dangerously-bypass-approvals-and-sandbox (no --cd flag like other agents)
    const logCommand = `codex exec --dangerously-bypass-approvals-and-sandbox "${instruction}"`

    await logger.command(logCommand)
    if (logger) {
      await logger.command(logCommand)
      const providerName = isVercelKey ? 'Vercel AI Gateway' : 'OpenAI API'
      await logger.info(
        `Executing Codex with model ${modelToUse} via ${providerName} and bypassed sandbox restrictions`,
      )
    }

    // Use the same pattern as other working agents (Claude, etc.)
    // Execute with environment variables using sh -c like Claude does
    const envPrefix = `AI_GATEWAY_API_KEY="${process.env.AI_GATEWAY_API_KEY}" HOME="/home/vercel-sandbox" CI="true"`
    const fullCommand = `${envPrefix} codex exec --dangerously-bypass-approvals-and-sandbox "${instruction}"`

    // Use the standard runCommandInSandbox helper like other agents
    const result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

    // Log the output and error results (similar to Claude and Cursor)
    if (result.output && result.output.trim()) {
      const redactedOutput = redactSensitiveInfo(result.output.trim())
      await logger.info(redactedOutput)
      if (logger) {
        await logger.info(redactedOutput)
      }
    }

    if (!result.success && result.error && result.error.trim()) {
      const redactedError = redactSensitiveInfo(result.error.trim())
      await logger.error(redactedError)
      if (logger) {
        await logger.error(redactedError)
      }
    }

    // Codex CLI execution completed

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    if (result.success || result.exitCode === 0) {
      return {
        success: true,
        output: `Codex CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
        agentResponse: result.output || 'Codex CLI completed the task',
        cliName: 'codex',
        changesDetected: !!hasChanges,
        error: undefined,
      }
    } else {
      return {
        success: false,
        error: `Codex CLI failed (exit code ${result.exitCode}): ${result.error || 'No error message'}`,
        agentResponse: result.output,
        cliName: 'codex',
        changesDetected: !!hasChanges,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute Codex CLI in sandbox'
    return {
      success: false,
      error: errorMessage,
      cliName: 'codex',
      changesDetected: false,
    }
  }
}
