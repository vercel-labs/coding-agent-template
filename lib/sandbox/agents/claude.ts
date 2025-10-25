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

    // Authenticate Claude CLI with API key
    if (process.env.ANTHROPIC_API_KEY) {
      await logger.info('Authenticating Claude CLI...')

      // Create Claude config directory (use $HOME instead of ~)
      await runCommandInSandbox(sandbox, 'mkdir', ['-p', '$HOME/.config/claude'])

      // Create config file directly using absolute path
      // Use selectedModel if provided, otherwise fall back to default

      if (mcpServers && mcpServers.length > 0) {
        await logger.info('Adding MCP servers')

        for (const server of mcpServers) {
          const serverName = server.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

          if (server.type === 'local') {
            // Local STDIO server - command string contains both executable and args
            const envPrefix = `ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`
            let addMcpCmd = `${envPrefix} claude mcp add "${serverName}" -- ${server.command}`

            // Add env vars if provided
            if (server.env && Object.keys(server.env).length > 0) {
              const envVars = Object.entries(server.env)
                .map(([key, value]) => `--env ${key}="${value}"`)
                .join(' ')
              addMcpCmd = addMcpCmd.replace(' --', ` ${envVars} --`)
            }

            const addResult = await runCommandInSandbox(sandbox, 'sh', ['-c', addMcpCmd])

            if (addResult.success) {
              await logger.info('Successfully added local MCP server')
            } else {
              const redactedError = redactSensitiveInfo(addResult.error || 'Unknown error')
              await logger.info('Failed to add MCP server')
            }
          } else {
            // Remote HTTP/SSE server
            const envPrefix = `ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`
            let addMcpCmd = `${envPrefix} claude mcp add --transport http "${serverName}" "${server.baseUrl}"`

            if (server.oauthClientSecret) {
              addMcpCmd += ` --header "Authorization: Bearer ${server.oauthClientSecret}"`
            }

            if (server.oauthClientId) {
              addMcpCmd += ` --header "X-Client-ID: ${server.oauthClientId}"`
            }

            const addResult = await runCommandInSandbox(sandbox, 'sh', ['-c', addMcpCmd])

            if (addResult.success) {
              await logger.info('Successfully added remote MCP server')
            } else {
              const redactedError = redactSensitiveInfo(addResult.error || 'Unknown error')
              await logger.info('Failed to add MCP server')
            }
          }
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

    // Check if ANTHROPIC_API_KEY is available
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        success: false,
        error: 'ANTHROPIC_API_KEY environment variable is required but not found',
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

    // Check MCP configuration status
    const envPrefix = `ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`
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
      if (sessionId) {
        fullCommand += ` --resume "${sessionId}"`
        if (logger) {
          await logger.info('Resuming specific Claude chat session')
        }
      } else {
        fullCommand += ` --resume`
        if (logger) {
          await logger.info('Resuming previous Claude conversation')
        }
      }
    }

    fullCommand += ` "${instruction}"`

    if (logger) {
      await logger.info('Executing Claude CLI with --dangerously-skip-permissions for automated file changes...')
    }

    // Log the command we're about to execute (with redacted API key)
    const redactedCommand = fullCommand.replace(process.env.ANTHROPIC_API_KEY!, '[REDACTED]')
    await logger.command(redactedCommand)

    // Set up streaming output capture if we have an agent message
    let capturedOutput = ''
    let accumulatedContent = ''
    let isCompleted = false

    const captureStdout = new Writable({
      write(chunk, _encoding, callback) {
        const text = chunk.toString()

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
                      .catch((err) => console.error('Failed to update message:', err))
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
                      console.log('Unknown Claude tool:', toolName, 'Input:', JSON.stringify(input))
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
                        .catch((err) => console.error('Failed to update message:', err))
                    }
                  }
                }
              }

              // Extract session ID and mark as completed from result chunks
              else if (parsed.type === 'result') {
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

    // Wait for completion - let sandbox timeout handle the hard limit
    while (!isCompleted) {
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait 1 second
    }

    await logger.info('Claude completed successfully')

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
