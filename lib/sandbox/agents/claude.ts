import { Sandbox } from '@vercel/sandbox'
import { Writable } from 'stream'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

const MAX_OUTPUT_SIZE_BYTES = 10 * 1024 * 1024 // 10MB output limit

type Connector = typeof connectors.$inferSelect

/**
 * Build .mcp.json content from connector configuration.
 * Claude Code discovers MCP servers from this file at startup.
 */
function buildMcpJsonConfig(mcpServers: Connector[]): Record<string, unknown> {
  const mcpServersConfig: Record<string, unknown> = {}

  for (const server of mcpServers) {
    const serverName = server.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    if (server.type === 'local' && server.command) {
      // Local STDIO server - parse command into command + args
      const commandParts = server.command.split(' ')
      const command = commandParts[0]
      const args = commandParts.slice(1)

      const serverConfig: Record<string, unknown> = {
        type: 'stdio',
        command,
      }

      if (args.length > 0) {
        serverConfig.args = args
      }

      // Add environment variables if provided
      if (server.env && typeof server.env === 'object' && Object.keys(server.env).length > 0) {
        serverConfig.env = server.env
      }

      mcpServersConfig[serverName] = serverConfig
    } else if (server.type === 'remote' && server.baseUrl) {
      // Remote HTTP server
      const serverConfig: Record<string, unknown> = {
        type: 'http',
        url: server.baseUrl,
      }

      // Build headers from multiple sources
      const headers: Record<string, string> = {}

      // 1. Add env variables as headers (for remote servers, env vars like "Authorization" become HTTP headers)
      if (server.env && typeof server.env === 'object') {
        for (const [key, value] of Object.entries(server.env)) {
          if (typeof value === 'string' && value.length > 0) {
            headers[key] = value
          }
        }
      }

      // 2. Add OAuth credentials (these override env if both are set)
      if (server.oauthClientSecret) {
        headers['Authorization'] = `Bearer ${server.oauthClientSecret}`
      }
      if (server.oauthClientId) {
        headers['X-Client-ID'] = server.oauthClientId
      }

      if (Object.keys(headers).length > 0) {
        serverConfig.headers = headers
      }

      mcpServersConfig[serverName] = serverConfig
    }
  }

  return { mcpServers: mcpServersConfig }
}

// Helper function to run command and collect logs in project directory
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  // Log to both local logs and database if logger is provided
  await logger.command(redactedCommand)
  if (logger) {
    await logger.command(redactedCommand)
  }

  const result = await runInProject(sandbox, command, args)

  // Only try to access properties if result is valid
  if (result && result.output && result.output.trim()) {
    const redactedOutput = redactSensitiveInfo(result.output.trim())
    await logger.info(redactedOutput)
    if (logger) {
      await logger.info(redactedOutput)
    }
  }

  if (result && !result.success && result.error) {
    const redactedError = redactSensitiveInfo(result.error)
    await logger.error(redactedError)
    if (logger) {
      await logger.error(redactedError)
    }
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
    if (logger) {
      await logger.error('Command execution failed - no result returned')
    }
    return errorResult
  }

  return result
}

export async function installClaudeCLI(
  sandbox: Sandbox,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
): Promise<{ success: boolean }> {
  // Check if Claude CLI is already installed (for resumed sandboxes)
  const existingCLICheck = await runCommandInSandbox(sandbox, 'which', ['claude'])

  let claudeInstall: { success: boolean; output?: string; error?: string } = { success: true }

  if (existingCLICheck.success && existingCLICheck.output?.includes('claude')) {
    // CLI already installed, skip installation
    await logger.info('Claude CLI already installed, skipping installation')
  } else {
    // Install Claude CLI
    await logger.info('Installing Claude CLI...')
    claudeInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', '@anthropic-ai/claude-code'])
  }

  if (claudeInstall.success) {
    await logger.info('Claude CLI installed successfully')

    // Detect authentication method
    const hasAiGatewayKey = !!process.env.AI_GATEWAY_API_KEY
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
    const useAiGateway = hasAiGatewayKey // Priority: AI Gateway first

    if (!hasAiGatewayKey && !hasAnthropicKey) {
      await logger.info('No API keys found for Claude CLI')
      return { success: false }
    }

    if (useAiGateway) {
      await logger.info('Using AI Gateway authentication')
    } else {
      await logger.info('Using direct Anthropic API authentication')
    }

    // Authenticate Claude CLI with appropriate method
    if (useAiGateway && process.env.AI_GATEWAY_API_KEY) {
      // AI Gateway configuration via environment variables
      const envExport = [
        'export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"',
        `export ANTHROPIC_AUTH_TOKEN="${process.env.AI_GATEWAY_API_KEY}"`,
        'export ANTHROPIC_API_KEY=""',
      ].join(' && ')

      // Add to shell profile for persistence
      await runCommandInSandbox(sandbox, 'sh', ['-c', `${envExport} && echo '${envExport}' >> ~/.bashrc`])

      // MCP servers configuration via .mcp.json file (Claude Code discovers servers from this file at startup)
      if (mcpServers && mcpServers.length > 0) {
        await logger.info('Creating .mcp.json config file for MCP server discovery')

        // Build and write .mcp.json to project directory
        const mcpConfig = buildMcpJsonConfig(mcpServers)
        const mcpJsonContent = JSON.stringify(mcpConfig, null, 2)

        // Write .mcp.json using heredoc (safe for JSON with quotes)
        const writeMcpCmd = `cat > ${PROJECT_DIR}/.mcp.json << 'MCPEOF'
${mcpJsonContent}
MCPEOF`

        const writeResult = await runCommandInSandbox(sandbox, 'sh', ['-c', writeMcpCmd])

        if (writeResult.success) {
          await logger.info('MCP config file created successfully')
          await logger.info('MCP servers configured successfully')
        } else {
          await logger.info('Failed to create MCP config file')
        }
      }

      // Verify authentication
      const verifyAuth = await runCommandInSandbox(sandbox, 'sh', ['-c', `${envExport} && claude --version`])

      if (verifyAuth.success) {
        await logger.info('Claude CLI authenticated successfully')
      } else {
        await logger.info('Warning: Claude CLI authentication could not be verified')
      }
    } else if (process.env.ANTHROPIC_API_KEY) {
      await logger.info('Authenticating Claude CLI...')

      // Create Claude config directory (use $HOME instead of ~)
      await runCommandInSandbox(sandbox, 'mkdir', ['-p', '$HOME/.config/claude'])

      // Create config file directly using absolute path
      // Use selectedModel if provided, otherwise fall back to default

      // MCP servers configuration via .mcp.json file (Claude Code discovers servers from this file at startup)
      if (mcpServers && mcpServers.length > 0) {
        await logger.info('Creating .mcp.json config file for MCP server discovery')

        // Build and write .mcp.json to project directory
        const mcpConfig = buildMcpJsonConfig(mcpServers)
        const mcpJsonContent = JSON.stringify(mcpConfig, null, 2)

        const writeMcpCmd = `cat > ${PROJECT_DIR}/.mcp.json << 'MCPEOF'
${mcpJsonContent}
MCPEOF`

        const writeResult = await runCommandInSandbox(sandbox, 'sh', ['-c', writeMcpCmd])

        if (writeResult.success) {
          await logger.info('MCP config file created successfully')
          await logger.info('MCP servers configured successfully')
        } else {
          await logger.info('Failed to create MCP config file')
        }
      }

      const modelToUse = selectedModel || 'claude-sonnet-4-5-20250929'
      const configFileCmd = `mkdir -p $HOME/.config/claude && cat > $HOME/.config/claude/config.json << 'EOF'
{
  "api_key": "${process.env.ANTHROPIC_API_KEY}",
  "default_model": "${modelToUse}"
}
EOF`
      const configFileResult = await runCommandInSandbox(sandbox, 'sh', ['-c', configFileCmd])

      if (configFileResult.success) {
        await logger.info('Claude CLI config file created successfully')
      } else {
        await logger.info('Warning: Failed to create Claude CLI config file')
      }

      // Verify authentication
      const verifyAuth = await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY} claude --version`,
      ])
      if (verifyAuth.success) {
        await logger.info('Claude CLI authentication verified')
      } else {
        await logger.info('Warning: Claude CLI authentication could not be verified')
      }
    } else {
      await logger.info('Warning: ANTHROPIC_API_KEY not found, Claude CLI may not work')
    }

    return { success: true }
  } else {
    await logger.info('Failed to install Claude CLI')
    return { success: false }
  }
}

export async function executeClaudeInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
  agentMessageId?: string,
): Promise<AgentExecutionResult> {
  let extractedSessionId: string | undefined
  let totalOutputBytes = 0
  let outputLimitReached = false
  try {
    // Executing Claude CLI with instruction

    // Check if Claude CLI is available and get version info
    const cliCheck = await runAndLogCommand(sandbox, 'which', ['claude'], logger)

    if (cliCheck.success) {
      // Get Claude CLI version for debugging
      await runAndLogCommand(sandbox, 'claude', ['--version'], logger)
      // Also try to see what commands are available
      await runAndLogCommand(sandbox, 'claude', ['--help'], logger)
    }

    if (!cliCheck.success) {
      // Claude CLI not found, try to install it
      // Claude CLI not found, installing
      const installResult = await installClaudeCLI(sandbox, logger, selectedModel, mcpServers)

      if (!installResult.success) {
        return {
          success: false,
          error: 'Failed to install Claude CLI',
          cliName: 'claude',
          changesDetected: false,
        }
      }
      // Claude CLI installed successfully

      // Verify installation worked
      const verifyCheck = await runAndLogCommand(sandbox, 'which', ['claude'], logger)
      if (!verifyCheck.success) {
        return {
          success: false,
          error: 'Claude CLI installation completed but CLI still not found',
          cliName: 'claude',
          changesDetected: false,
        }
      }
    }

    // Check if either API key is available
    if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return {
        success: false,
        error: 'Either ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY environment variable is required',
        cliName: 'claude',
        changesDetected: false,
      }
    }

    // Log what we're trying to do
    const modelToUse = selectedModel || 'claude-sonnet-4-5-20250929'
    if (logger) {
      await logger.info(
        `Attempting to execute Claude CLI with model ${modelToUse} and instruction: ${instruction.substring(0, 100)}...`,
      )
    }

    // Determine environment prefix based on auth method
    const useAiGateway = !!process.env.AI_GATEWAY_API_KEY
    const envPrefix = useAiGateway
      ? `ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh" ANTHROPIC_AUTH_TOKEN="${process.env.AI_GATEWAY_API_KEY}" ANTHROPIC_API_KEY=""`
      : `ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`

    // Check MCP configuration status
    const mcpList = await runCommandInSandbox(sandbox, 'sh', ['-c', `${envPrefix} claude mcp list`])
    await logger.info('MCP servers list retrieved')
    if (mcpList.error) {
      await logger.info('MCP list error occurred')
    }

    // Create initial empty agent message in database if streaming
    if (taskId && agentMessageId) {
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: '',
        createdAt: new Date(),
      })
    }

    // Build command with stream-json output format for streaming
    let fullCommand = `${envPrefix} claude --model "${modelToUse}" --dangerously-skip-permissions --output-format stream-json --verbose`

    // Add --resume flag for follow-up messages in kept-alive sandboxes
    if (isResumed) {
      // Only use --resume with a valid session ID (UUID format)
      const isValidSessionId =
        sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)
      if (isValidSessionId) {
        fullCommand += ` --resume "${sessionId}"`
        await logger.info('Resuming with session ID')
      } else {
        // Fall back to --continue for most recent session in this directory
        fullCommand += ` --continue`
        await logger.info('Using continue flag for session resumption')
      }
    }

    fullCommand += ` "${instruction}"`

    if (logger) {
      await logger.info('Executing Claude CLI with --dangerously-skip-permissions for automated file changes...')
    }

    // Log the command we're about to execute (with redacted API keys)
    let redactedCommand = fullCommand
    if (process.env.ANTHROPIC_API_KEY) {
      redactedCommand = redactedCommand.replace(process.env.ANTHROPIC_API_KEY, '[REDACTED]')
    }
    if (process.env.AI_GATEWAY_API_KEY) {
      redactedCommand = redactedCommand.replace(process.env.AI_GATEWAY_API_KEY, '[REDACTED]')
    }
    await logger.command(redactedCommand)

    // Set up streaming output capture if we have an agent message
    let capturedOutput = ''
    let accumulatedContent = ''
    let isCompleted = false
    let lastActivityTime = Date.now()
    const INACTIVITY_TIMEOUT = 2 * 60 * 1000 // 2 minutes of no output = stalled

    const captureStdout = new Writable({
      write(chunk, _encoding, callback) {
        const text = chunk.toString()
        lastActivityTime = Date.now() // Update activity timestamp

        // Track total output size
        totalOutputBytes += Buffer.byteLength(text, 'utf8')
        if (totalOutputBytes > MAX_OUTPUT_SIZE_BYTES && !outputLimitReached) {
          outputLimitReached = true
          console.log('[Output Limit] Exceeded', MAX_OUTPUT_SIZE_BYTES, 'bytes, stopping accumulation')
        }

        // Stop accumulating content if limit reached
        if (outputLimitReached) {
          callback()
          return
        }

        // Only accumulate raw output if not streaming to DB
        if (!agentMessageId || !taskId) {
          capturedOutput += text
        }

        // Parse streaming JSON if we have a message to update
        if (agentMessageId && taskId) {
          // Split by newlines and process each line
          const lines = text.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('//')) continue

            try {
              const parsed = JSON.parse(trimmed)

              // Handle assistant messages with content
              if (parsed.type === 'assistant' && parsed.message?.content) {
                for (const contentBlock of parsed.message.content) {
                  // Handle text content
                  if (contentBlock.type === 'text' && contentBlock.text) {
                    accumulatedContent += contentBlock.text

                    // Update database with accumulated content
                    db.update(taskMessages)
                      .set({
                        content: accumulatedContent,
                      })
                      .where(eq(taskMessages.id, agentMessageId))
                      .then(() => {})
                      .catch((err) => console.error('Failed to update message'))
                  }
                  // Handle tool use
                  else if (contentBlock.type === 'tool_use') {
                    let statusMsg = ''
                    const toolName = contentBlock.name
                    const input = contentBlock.input || {}

                    if (toolName === 'Write' || toolName === 'Edit') {
                      const path = input.path || input.file_path || input.filepath || 'file'
                      statusMsg = `Editing ${path}`
                    } else if (toolName === 'Read') {
                      const path = input.path || input.file_path || input.filepath || 'file'
                      statusMsg = `Reading ${path}`
                    } else if (toolName === 'Glob') {
                      const pattern = input.pattern || input.glob_pattern || input.glob || '*'
                      statusMsg = `Searching files: ${pattern}`
                    } else if (toolName === 'Bash') {
                      const command = input.command || input.cmd || input.script || 'command'
                      // Truncate long commands
                      const displayCmd = command.length > 50 ? command.substring(0, 50) + '...' : command
                      statusMsg = `Running: ${displayCmd}`
                    } else if (toolName === 'Grep') {
                      const pattern = input.pattern || input.regex || input.search || 'pattern'
                      statusMsg = `Grep: ${pattern}`
                    } else {
                      // For debugging, log the tool name and input to console
                      console.log('Unknown Claude tool detected')
                      // Skip logging generic tool uses to reduce noise
                      statusMsg = ''
                    }

                    if (statusMsg) {
                      accumulatedContent += `\n\n${statusMsg}\n\n`

                      // Update database
                      db.update(taskMessages)
                        .set({
                          content: accumulatedContent,
                        })
                        .where(eq(taskMessages.id, agentMessageId))
                        .then(() => {})
                        .catch((err) => console.error('Failed to update message'))
                    }
                  }
                }
              }

              // Track session ID from any source
              if (!extractedSessionId && parsed.session_id) {
                extractedSessionId = parsed.session_id
                console.log('Extracted session ID from', parsed.type, ':', extractedSessionId)
              }

              // Extract session ID and mark as completed from result chunks
              if (parsed.type === 'result') {
                console.log('Result chunk received:', JSON.stringify(parsed).substring(0, 300))
                if (parsed.session_id) {
                  extractedSessionId = parsed.session_id
                  console.log('Extracted session ID:', extractedSessionId)
                } else {
                  console.log('No session_id in result chunk')
                }
                isCompleted = true
              }
            } catch {
              // Not JSON, ignore
            }
          }
        }

        callback()
      },
    })

    const captureStderr = new Writable({
      write(chunk, _encoding, callback) {
        // Capture stderr for error logging
        lastActivityTime = Date.now() // Update activity timestamp
        callback()
      },
    })

    // Execute Claude CLI with streaming
    await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', fullCommand],
      sudo: false,
      detached: true,
      cwd: PROJECT_DIR,
      stdout: captureStdout,
      stderr: captureStderr,
    })

    await logger.info('Claude command started with output capture, monitoring for completion...')

    // Wait for completion with timeout
    const MAX_WAIT_TIME = 5 * 60 * 1000 // 5 minutes
    const startWaitTime = Date.now()

    // Import once before the loop to avoid repeated module resolution overhead
    const { isTaskStopped } = await import('@/lib/tasks/process-task')

    while (!isCompleted) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const elapsed = Date.now() - startWaitTime
      const inactiveTime = Date.now() - lastActivityTime

      // Check if output limit was reached
      if (outputLimitReached) {
        await logger.info('Output size limit reached')
        break
      }

      // Check for cancellation every iteration
      if (taskId) {
        const stopped = await isTaskStopped(taskId)
        if (stopped) {
          await logger.info('Task was stopped, terminating agent')
          return {
            success: false,
            error: 'Task was cancelled by user',
            cliName: 'claude',
            changesDetected: false,
          }
        }
      }

      // Check for inactivity - no output for too long
      if (inactiveTime > INACTIVITY_TIMEOUT) {
        await logger.info('Agent appears stalled due to inactivity')
        await logger.error('No output received for extended period')
        // Mark as completed to exit loop - the result will indicate failure
        break
      }

      if (elapsed > MAX_WAIT_TIME) {
        await logger.info('Agent wait timeout reached')
        // Force completion after timeout - check if process produced any output
        break
      }
      // Log progress every 30 seconds
      if (elapsed % 30000 < 1000) {
        await logger.info('Waiting for agent completion')
      }
    }

    // Check if we exited due to inactivity
    if (!isCompleted) {
      const inactiveTime = Date.now() - lastActivityTime
      if (inactiveTime > INACTIVITY_TIMEOUT) {
        return {
          success: false,
          error: 'Agent stalled - no output for extended period',
          cliName: 'claude',
          changesDetected: false,
          sessionId: extractedSessionId,
        }
      }
    }

    await logger.info('Claude completed successfully')

    // Check if output limit caused termination
    if (outputLimitReached) {
      return {
        success: false,
        error: 'Agent output exceeded size limit',
        cliName: 'claude',
        changesDetected: false,
        sessionId: extractedSessionId,
      }
    }

    // Better completion detection - check if agent actually ran
    const fullStdout = agentMessageId ? accumulatedContent : capturedOutput
    const hasOutput = fullStdout.length > 100 // Minimal expected output
    if (!hasOutput && !isCompleted) {
      await logger.error('Agent produced minimal output')
      return {
        success: false,
        error: 'Agent execution failed - no output received',
        cliName: 'claude',
        changesDetected: false,
        sessionId: extractedSessionId,
      }
    }

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)

    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    // Log additional debugging info if no changes were made
    if (!hasChanges) {
      await logger.info('No changes detected. Checking if files exist...')

      // Check if common files exist
      await runAndLogCommand(sandbox, 'find', ['.', '-name', 'README*', '-o', '-name', 'readme*'], logger)
      await runAndLogCommand(sandbox, 'ls', ['-la'], logger)
    }

    console.log('Claude execution completed, returning sessionId:', extractedSessionId)

    return {
      success: true,
      output: `Claude CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
      // Don't include agentResponse when streaming to DB to prevent duplicate display
      agentResponse: agentMessageId ? undefined : capturedOutput || 'No detailed response available',
      cliName: 'claude',
      changesDetected: !!hasChanges,
      error: undefined,
      sessionId: extractedSessionId, // Include session ID for resumption
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute Claude CLI in sandbox'
    return {
      success: false,
      error: errorMessage,
      cliName: 'claude',
      changesDetected: false,
    }
  }
}
