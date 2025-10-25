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

type Connector = typeof connectors.$inferSelect

// Helper function to run command and log it in project directory
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  await logger.command(redactSensitiveInfo(fullCommand))

  const result = await runInProject(sandbox, command, args)

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
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
  agentMessageId?: string,
): Promise<AgentExecutionResult> {
  try {
    // Executing Codex CLI with instruction

    // Check if Codex CLI is already installed (for resumed sandboxes)
    const existingCLICheck = await runCommandInSandbox(sandbox, 'which', ['codex'])

    let installResult: { success: boolean; output?: string; error?: string } = { success: true }

    if (existingCLICheck.success && existingCLICheck.output?.includes('codex')) {
      // CLI already installed, skip installation
      await logger.info('Codex CLI already installed, skipping installation')
    } else {
      // Install Codex CLI using npm
      // Installing Codex CLI
      await logger.info('Installing Codex CLI...')
      installResult = await runAndLogCommand(sandbox, 'npm', ['install', '-g', '@openai/codex'], logger)

      if (!installResult.success) {
        return {
          success: false,
          error: `Failed to install Codex CLI: ${installResult.error}`,
          cliName: 'codex',
          changesDetected: false,
        }
      }

      await logger.info('Codex CLI installed successfully')
    }

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
      await logger.info('Using API key for authentication')
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
      cwd: PROJECT_DIR,
    })

    if (logger) {
      await logger.info('Codex CLI version test completed')
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
      await logger.info('Configuring MCP servers')

      // Check if we need experimental RMCP client (for remote servers)
      const hasRemoteServers = mcpServers.some((s) => s.type === 'remote')
      if (hasRemoteServers) {
        configToml = `experimental_use_rmcp_client = true\n\n` + configToml
      }

      for (const server of mcpServers) {
        const serverName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

        if (server.type === 'local') {
          // Local STDIO server - parse command string into command and args
          const commandParts = server.command!.trim().split(/\s+/)
          const executable = commandParts[0]
          const args = commandParts.slice(1)

          configToml += `
[mcp_servers.${serverName}]
command = "${executable}"
`
          // Add args if provided
          if (args.length > 0) {
            configToml += `args = [${args.map((arg) => `"${arg}"`).join(', ')}]\n`
          }

          // Add env vars if provided
          if (server.env && Object.keys(server.env).length > 0) {
            configToml += `env = { ${Object.entries(server.env)
              .map(([key, value]) => `"${key}" = "${value}"`)
              .join(', ')} }\n`
          }

          await logger.info('Added local MCP server')
        } else {
          // Remote HTTP/SSE server
          configToml += `
[mcp_servers.${serverName}]
url = "${server.baseUrl}"
`
          // Add bearer token if available (using oauthClientSecret)
          if (server.oauthClientSecret) {
            configToml += `bearer_token = "${server.oauthClientSecret}"\n`
          }

          await logger.info('Added remote MCP server')
        }
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
      cwd: PROJECT_DIR,
    })

    if (logger) {
      await logger.info('Codex config setup completed')
    }

    // Debug: Check if the config file was created correctly (without logging sensitive contents)
    const configCheckResult = await sandbox.runCommand({
      cmd: 'test',
      args: ['-f', '~/.codex/config.toml'],
      env: { HOME: '/home/vercel-sandbox' },
      sudo: false,
      cwd: PROJECT_DIR,
    })

    if (logger && configCheckResult.exitCode === 0) {
      await logger.info('Config file verified')
    }

    // Debug: List files in the current directory before running Codex
    const lsDebugResult = await runCommandInSandbox(sandbox, 'ls', ['-la'])
    if (logger) {
      await logger.info('Current directory contents retrieved')
    }

    // Debug: Show current working directory
    const pwdResult = await runCommandInSandbox(sandbox, 'pwd', [])
    if (logger) {
      await logger.info('Current working directory retrieved')
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

    // Use exec command with Vercel AI Gateway configuration
    // The model is now configured in config.toml, so we can use it directly
    // Use --dangerously-bypass-approvals-and-sandbox with --json for streaming output
    // If resuming, use 'codex resume' instead of 'codex exec'
    let codexCommand = 'codex exec --dangerously-bypass-approvals-and-sandbox --json'

    if (isResumed) {
      // Use resume command instead of exec
      // Note: codex resume doesn't take session ID as an argument, it uses a picker or --last
      // For now, we'll use --last to continue the most recent session
      codexCommand = 'codex resume --last --json'
      if (logger) {
        await logger.info('Resuming previous Codex conversation')
      }
    }

    const logCommand = `${codexCommand} "${instruction}"`

    await logger.command(logCommand)
    if (logger) {
      const providerName = isVercelKey ? 'Vercel AI Gateway' : 'OpenAI API'
      await logger.info(
        `Executing Codex with model ${modelToUse} via ${providerName} and bypassed sandbox restrictions`,
      )
    }

    // Set up streaming output capture
    let capturedOutput = ''
    let capturedError = ''
    let accumulatedContent = ''
    let isCompleted = false
    let extractedSessionId: string | undefined

    interface WriteCallback {
      (error?: Error | null): void
    }

    const captureStdout = new Writable({
      write(chunk: Buffer | string, encoding: BufferEncoding, callback: WriteCallback) {
        const data = chunk.toString()

        // Only capture raw output if we're NOT streaming to database
        if (!agentMessageId || !taskId) {
          capturedOutput += data
        }

        // Parse streaming JSONL chunks
        const lines = data.split('\n')
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line)

              // Debug: Log event types to understand the structure
              if (parsed.type) {
                console.log('Codex event type:', parsed.type)
              }

              // Extract session_id from any event that has it
              if (parsed.session_id) {
                extractedSessionId = parsed.session_id
                console.log('Extracted session ID:', extractedSessionId)
              }

              // Only update database if streaming to taskId
              if (agentMessageId && taskId) {
                // Handle assistant messages (similar to Cursor format)
                if (parsed.type === 'assistant' && parsed.message?.content) {
                  console.log('Processing assistant message with content')
                  // Extract text from content array
                  for (const contentBlock of parsed.message.content) {
                    if (contentBlock.type === 'text' && contentBlock.text) {
                      accumulatedContent += '\n\n' + contentBlock.text
                      db.update(taskMessages)
                        .set({ content: accumulatedContent })
                        .where(eq(taskMessages.id, agentMessageId))
                        .catch((err: Error) => console.error('Failed to update message:', err))
                    }
                  }
                }
                // Handle tool calls
                else if (parsed.type === 'tool_call' && parsed.subtype === 'started') {
                  const toolCall = parsed.tool_call || {}
                  const toolName = Object.keys(toolCall)[0]
                  let statusMsg = ''

                  if (toolName === 'editToolCall') {
                    const path = toolCall.editToolCall?.args?.path || 'file'
                    statusMsg = `\n\nEditing ${path}`
                  } else if (toolName === 'readToolCall') {
                    const path = toolCall.readToolCall?.args?.path || 'file'
                    statusMsg = `\n\nReading ${path}`
                  } else if (toolName === 'shellToolCall') {
                    const command = toolCall.shellToolCall?.args?.command || 'command'
                    statusMsg = `\n\nRunning: ${command}`
                  } else if (toolName === 'globToolCall') {
                    const pattern = toolCall.globToolCall?.args?.glob_pattern || 'files'
                    statusMsg = `\n\nFinding files: ${pattern}`
                  } else if (toolName === 'grepToolCall') {
                    const pattern = toolCall.grepToolCall?.args?.pattern || 'pattern'
                    statusMsg = `\n\nSearching for: ${pattern}`
                  } else if (toolName) {
                    const cleanName = toolName.replace(/ToolCall$/, '')
                    statusMsg = `\n\nExecuting ${cleanName}`
                  }

                  if (statusMsg) {
                    accumulatedContent += statusMsg
                    db.update(taskMessages)
                      .set({ content: accumulatedContent })
                      .where(eq(taskMessages.id, agentMessageId))
                      .catch((err: Error) => console.error('Failed to update message:', err))
                  }
                }
                // Handle item-based events (alternative format)
                else if (parsed.type === 'item.started' || parsed.type === 'item.updated') {
                  if (parsed.item?.type === 'tool_call') {
                    const toolName = parsed.item.name
                    let statusMsg = ''

                    if (toolName === 'Edit' || toolName === 'Write') {
                      const path = parsed.item.input?.path || 'file'
                      statusMsg = `\n\nEditing ${path}`
                    } else if (toolName === 'Read') {
                      const path = parsed.item.input?.path || 'file'
                      statusMsg = `\n\nReading ${path}`
                    } else if (toolName === 'Bash' || toolName === 'Shell') {
                      const command = parsed.item.input?.command || 'command'
                      statusMsg = `\n\nRunning: ${command}`
                    } else if (toolName === 'Glob') {
                      const pattern = parsed.item.input?.pattern || 'files'
                      statusMsg = `\n\nFinding files: ${pattern}`
                    } else if (toolName === 'Grep') {
                      const pattern = parsed.item.input?.pattern || 'pattern'
                      statusMsg = `\n\nSearching for: ${pattern}`
                    } else if (toolName === 'SemanticSearch') {
                      const query = parsed.item.input?.query || 'code'
                      statusMsg = `\n\nSearching codebase: ${query}`
                    } else if (toolName) {
                      statusMsg = `\n\nExecuting ${toolName}`
                    }

                    if (statusMsg) {
                      accumulatedContent += statusMsg
                      db.update(taskMessages)
                        .set({ content: accumulatedContent })
                        .where(eq(taskMessages.id, agentMessageId))
                        .catch((err: Error) => console.error('Failed to update message:', err))
                    }
                  }
                  // Handle text content from assistant messages
                  else if (parsed.item?.type === 'text' && parsed.item.text) {
                    accumulatedContent += parsed.item.text
                    db.update(taskMessages)
                      .set({ content: accumulatedContent })
                      .where(eq(taskMessages.id, agentMessageId))
                      .catch((err: Error) => console.error('Failed to update message:', err))
                  }
                }
                // Mark completion
                else if (parsed.type === 'turn.completed' || parsed.type === 'result') {
                  isCompleted = true
                  if (logger) {
                    logger.info('Detected completion in Codex output')
                  }
                }
              }
            } catch (e) {
              // Ignore JSON parse errors for non-JSON lines
            }
          }
        }

        callback()
      },
    })

    const captureStderr = new Writable({
      write(chunk: Buffer | string, encoding: BufferEncoding, callback: WriteCallback) {
        capturedError += chunk.toString()
        callback()
      },
    })

    // Execute with environment variables using sandbox.runCommand for streaming
    await sandbox.runCommand({
      cmd: 'codex',
      args: isResumed
        ? ['resume', '--last', '--json', instruction]
        : ['exec', '--dangerously-bypass-approvals-and-sandbox', '--json', instruction],
      env: {
        AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY!,
        HOME: '/home/vercel-sandbox',
        CI: 'true',
      },
      sudo: false,
      detached: true,
      cwd: PROJECT_DIR,
      stdout: captureStdout,
      stderr: captureStderr,
    })

    if (logger) {
      await logger.info('Codex command started with output capture, monitoring for completion...')
    }

    // Wait for completion - let sandbox timeout handle the hard limit
    let attempts = 0
    while (!isCompleted) {
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait 1 second
      attempts++

      // Safety check: if we've been waiting over 4 minutes, break and check git status
      // (sandbox timeout is 5 minutes, so we leave a buffer)
      if (attempts > 240) {
        if (logger) {
          await logger.info('Approaching sandbox timeout, checking for changes...')
        }
        break
      }
    }

    if (isCompleted) {
      if (logger) {
        await logger.info('Codex completed successfully')
      }
    } else {
      if (logger) {
        await logger.info('Codex execution ended, checking for changes')
      }
    }

    // Skip logging raw output when streaming to database (we've already built clean content there)
    if (capturedOutput && capturedOutput.trim() && !agentMessageId) {
      const redactedOutput = redactSensitiveInfo(capturedOutput.trim())
      await logger.info(redactedOutput)
    }

    if (capturedError && capturedError.trim()) {
      const redactedError = redactSensitiveInfo(capturedError)
      await logger.error(redactedError)
    }

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    // Success is determined by the CLI execution, not by code changes
    return {
      success: true,
      output: `Codex CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
      // When streaming to DB, agentResponse is already in chat; omit it here
      agentResponse: agentMessageId ? undefined : capturedOutput || 'Codex CLI completed the task',
      cliName: 'codex',
      changesDetected: !!hasChanges,
      error: undefined,
      sessionId: extractedSessionId, // Include session ID for resumption
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
