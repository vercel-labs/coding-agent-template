import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

type Connector = typeof connectors.$inferSelect

// Helper function to run command in sandbox root (for installation checks)
async function runAndLogCommandRoot(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
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

// Helper function to run command in project directory (for git operations)
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

export async function executeCursorInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
): Promise<AgentExecutionResult> {
  try {
    // Executing Cursor CLI with instruction

    // Check if Cursor CLI is already installed (for resumed sandboxes)
    const existingCliCheck = await runCommandInSandbox(
      sandbox,
      'sh',
      ['-c', 'export PATH="$HOME/.local/bin:$PATH"; which cursor-agent 2>/dev/null'],
      // Don't log this check to avoid cluttering logs
    )

    let cursorInstall: { success: boolean; output?: string; error?: string } = { success: true }

    if (existingCliCheck.success && existingCliCheck.output?.includes('cursor-agent')) {
      // CLI already installed, skip installation
      if (logger) {
        await logger.info('Cursor CLI already installed, skipping installation')
      }
    } else {
      // Install Cursor CLI using the official installer
      if (logger) {
        await logger.info('Starting Cursor CLI installation...')
      }

      // Install Cursor CLI using the official installation script
      // Add debugging to see what the installation script does
      const installCommand = 'curl https://cursor.com/install -fsS | bash -s -- --verbose'
      cursorInstall = await runAndLogCommandRoot(sandbox, 'sh', ['-c', installCommand], logger)

      // After installation, check what was installed and where
      if (logger) {
        await logger.info('Installation completed, checking what was installed...')
      }

      const postInstallChecks = [
        'ls -la ~/.local/bin/ 2>/dev/null || echo "No ~/.local/bin directory"',
        'echo "Current PATH: $PATH"',
        'export PATH="$HOME/.local/bin:$PATH"; which cursor-agent || echo "cursor-agent not found even with updated PATH"',
        'export PATH="$HOME/.local/bin:$PATH"; cursor-agent --version || echo "cursor-agent version check failed"',
      ]

      for (const checkCmd of postInstallChecks) {
        const checkResult = await runAndLogCommandRoot(sandbox, 'sh', ['-c', checkCmd], logger)
        if (logger && checkResult.output) {
          await logger.info('Post-install check completed')
        }
      }
    }

    if (!cursorInstall.success) {
      if (logger) {
        await logger.info('Primary installation failed, trying alternative method...')
      }

      // Try alternative installation method (if there's a npm package or direct download)
      // For now, we'll fail gracefully with a more informative error
      const errorMsg = `Failed to install Cursor CLI: ${cursorInstall.error || 'Installation timed out or failed'}. The Cursor CLI installation script may not be compatible with this sandbox environment.`
      if (logger) {
        await logger.error(errorMsg)
      }
      return {
        success: false,
        error: errorMsg,
        cliName: 'cursor',
        changesDetected: false,
      }
    }

    console.log('Cursor CLI installed successfully')
    if (logger) {
      await logger.info('Cursor CLI installation completed, checking availability...')
    }

    // Check if Cursor CLI is available (add ~/.local/bin to PATH)
    const cliCheck = await runAndLogCommandRoot(
      sandbox,
      'sh',
      ['-c', 'export PATH="$HOME/.local/bin:$PATH"; which cursor-agent'],
      logger,
    )

    if (!cliCheck.success) {
      // Try to find where cursor-agent might be installed
      if (logger) {
        await logger.info('cursor-agent not found in PATH, searching for it...')
      }

      const searchPaths = [
        'find /usr/local/bin -name "*cursor*" 2>/dev/null || true',
        'find /home -name "*cursor*" 2>/dev/null || true',
        'find /opt -name "*cursor*" 2>/dev/null || true',
        'ls -la ~/.local/bin/ 2>/dev/null || true',
        'echo $PATH',
      ]

      for (const searchCmd of searchPaths) {
        const searchResult = await runAndLogCommandRoot(sandbox, 'sh', ['-c', searchCmd], logger)
        if (logger && searchResult.output) {
          await logger.info('Search completed')
        }
      }

      return {
        success: false,
        error: 'Cursor CLI (cursor-agent) not found after installation. Check logs for search results.',
        cliName: 'cursor',
        changesDetected: false,
      }
    }

    // Check if CURSOR_API_KEY is available
    if (!process.env.CURSOR_API_KEY) {
      return {
        success: false,
        error: 'CURSOR_API_KEY not found. Please set the API key to use Cursor agent.',
        cliName: 'cursor',
        changesDetected: false,
      }
    }

    // Configure MCP servers if provided
    if (mcpServers && mcpServers.length > 0) {
      await logger.info('Configuring MCP servers')

      // Create mcp.json configuration file
      const mcpConfig: {
        mcpServers: Record<
          string,
          | { url: string; headers?: Record<string, string> }
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

          mcpConfig.mcpServers[serverName] = {
            command: executable,
            ...(args.length > 0 ? { args } : {}),
            ...(envObject ? { env: envObject } : {}),
          }
          await logger.info('Added local MCP server')
        } else {
          // Remote HTTP/SSE server
          mcpConfig.mcpServers[serverName] = {
            url: server.baseUrl!,
          }

          // Merge headers from oauth and env
          const headers: Record<string, string> = {}
          if (server.oauthClientSecret) {
            headers.Authorization = `Bearer ${server.oauthClientSecret}`
          }
          if (server.oauthClientId) {
            headers['X-Client-ID'] = server.oauthClientId
          }
          if (Object.keys(headers).length > 0) {
            mcpConfig.mcpServers[serverName].headers = headers
          }

          await logger.info('Added remote MCP server')
        }
      }

      // Write the mcp.json file to the Cursor config directory (not project directory)
      const mcpConfigJson = JSON.stringify(mcpConfig, null, 2)
      const createMcpConfigCmd = `mkdir -p ~/.cursor && cat > ~/.cursor/mcp.json << 'EOF'
${mcpConfigJson}
EOF`

      await logger.info('Creating Cursor MCP configuration file...')
      const mcpConfigResult = await runCommandInSandbox(sandbox, 'sh', ['-c', createMcpConfigCmd])

      if (mcpConfigResult.success) {
        await logger.info('MCP configuration file (~/.cursor/mcp.json) created successfully')

        // Verify the file was created (without logging sensitive contents)
        const verifyMcpConfig = await runCommandInSandbox(sandbox, 'test', ['-f', '~/.cursor/mcp.json'])
        if (verifyMcpConfig.success) {
          await logger.info('MCP configuration verified')
        }
      } else {
        await logger.info('Warning: Failed to create MCP configuration file')
      }
    }

    // Execute Cursor CLI with the instruction using print mode and force flag for file modifications
    if (logger) {
      await logger.info('Starting Cursor CLI execution with instruction...')
    }

    // Debug: Check if cursor-agent is still available right before execution
    const preExecCheck = await runAndLogCommandRoot(
      sandbox,
      'sh',
      ['-c', 'export PATH="$HOME/.local/bin:$PATH"; which cursor-agent'],
      logger,
    )
    if (logger) {
      await logger.info('Pre-execution cursor-agent check completed')
      if (preExecCheck.output) {
        await logger.info('cursor-agent location found')
      }
    }

    // Use the correct flags: -p for print mode (non-interactive), --force for file modifications
    // Try multiple approaches to find and execute cursor-agent

    // Log what we're about to execute
    const modelFlag = selectedModel ? ` --model ${selectedModel}` : ''
    const resumeFlag = isResumed && sessionId ? ` --resume ${sessionId}` : ''
    const logCommand = `cursor-agent -p --force --output-format stream-json${modelFlag}${resumeFlag} "${instruction}"`
    if (logger) {
      await logger.command(logCommand)
      if (selectedModel) {
        await logger.info('Executing cursor-agent with model')
      }
      if (isResumed) {
        if (sessionId) {
          await logger.info('Resuming specific chat session')
        } else {
          await logger.info('Resuming previous conversation')
        }
      }
      await logger.info('Executing cursor-agent directly without shell wrapper')
    }

    // Execute cursor-agent using the proper Vercel Sandbox API with environment variables
    if (logger) {
      await logger.info('Executing cursor-agent with proper environment variables via Sandbox API')
    }

    // Capture output by intercepting the streams
    let capturedOutput = ''
    let capturedError = ''
    let isCompleted = false

    // Create custom writable streams to capture the output
    const { Writable } = await import('stream')

    interface WriteCallback {
      (error?: Error | null): void
    }

    let accumulatedContent = ''
    let extractedSessionId: string | undefined

    const captureStdout = new Writable({
      write(chunk: Buffer | string, encoding: BufferEncoding, callback: WriteCallback) {
        const data = chunk.toString()

        // Only capture raw output if we're NOT streaming to database
        // When streaming, we build clean content in the database instead
        if (!agentMessageId || !taskId) {
          capturedOutput += data
        }

        // Parse streaming JSON chunks - always do this to extract session_id
        const lines = data.split('\n')
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line)

              // Always extract session_id from result
              if (parsed.type === 'result' && parsed.session_id) {
                extractedSessionId = parsed.session_id
              }

              // Only update database if streaming to taskId
              if (agentMessageId && taskId) {
                // Handle different chunk types from Cursor's stream-json format
                if (parsed.type === 'tool_call') {
                  // Show tool execution status
                  if (parsed.subtype === 'started') {
                    const toolName = Object.keys(parsed.tool_call || {})[0]
                    let statusMsg = ''

                    if (toolName === 'editToolCall') {
                      const path = parsed.tool_call?.editToolCall?.args?.path || 'file'
                      statusMsg = `\n\nEditing ${path}`
                    } else if (toolName === 'readToolCall') {
                      const path = parsed.tool_call?.readToolCall?.args?.path || 'file'
                      statusMsg = `\n\nReading ${path}`
                    } else if (toolName === 'runCommandToolCall') {
                      statusMsg = `\n\nRunning command`
                    } else if (toolName === 'listDirectoryToolCall') {
                      statusMsg = `\n\nListing directory`
                    } else if (toolName === 'shellToolCall') {
                      // Extract command from shell tool call
                      const command = parsed.tool_call?.shellToolCall?.args?.command || 'command'
                      statusMsg = `\n\nRunning: ${command}`
                    } else if (toolName === 'grepToolCall') {
                      const pattern = parsed.tool_call?.grepToolCall?.args?.pattern || 'pattern'
                      statusMsg = `\n\nSearching for: ${pattern}`
                    } else if (toolName === 'semSearchToolCall') {
                      const query = parsed.tool_call?.semSearchToolCall?.args?.query || 'code'
                      statusMsg = `\n\nSearching codebase: ${query}`
                    } else if (toolName === 'globToolCall') {
                      const pattern = parsed.tool_call?.globToolCall?.args?.glob_pattern || 'files'
                      statusMsg = `\n\nFinding files: ${pattern}`
                    } else {
                      // For any other tool calls, show a generic message without the "ToolCall" suffix
                      const cleanToolName = toolName.replace(/ToolCall$/, '')
                      statusMsg = `\n\nExecuting ${cleanToolName}`
                    }

                    if (statusMsg) {
                      accumulatedContent += statusMsg
                      db.update(taskMessages)
                        .set({ content: accumulatedContent })
                        .where(eq(taskMessages.id, agentMessageId))
                        .catch((err: Error) => console.error('Failed to update message:', err))
                    }
                  }
                } else if (parsed.type === 'assistant' && parsed.message?.content) {
                  // Extract text from assistant message content array
                  const textContent = parsed.message.content
                    .filter((item: { type: string; text?: string }) => item.type === 'text')
                    .map((item: { text?: string }) => item.text)
                    .join('')

                  if (textContent) {
                    accumulatedContent += '\n\n' + textContent
                    // Update message in database (non-blocking)
                    db.update(taskMessages)
                      .set({ content: accumulatedContent })
                      .where(eq(taskMessages.id, agentMessageId))
                      .catch((err: Error) => console.error('Failed to update message:', err))
                  }
                }
              }
            } catch {
              // Ignore JSON parse errors for non-JSON lines
            }
          }
        }

        // Check if we got the completion JSON
        if (
          data.includes('"type":"result"') &&
          (data.includes('"subtype":"success"') || data.includes('"is_error":false'))
        ) {
          isCompleted = true
          if (logger) {
            logger.info('Detected completion in captured output')
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

    // Create initial agent message in database if taskId provided
    let agentMessageId: string | null = null
    if (taskId) {
      agentMessageId = generateId(12)
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: '', // Start with empty content, will be updated as chunks arrive
      })
    }

    // Start the command with output capture
    // Add model parameter if provided
    const args = ['-p', '--force', '--output-format', 'stream-json']
    if (selectedModel) {
      args.push('--model', selectedModel)
    }
    // Add --resume flag only if we have a sessionId to resume
    if (isResumed && sessionId) {
      args.push('--resume', sessionId)
    }
    args.push(instruction)

    await sandbox.runCommand({
      cmd: '/home/vercel-sandbox/.local/bin/cursor-agent',
      args: args,
      env: {
        CURSOR_API_KEY: process.env.CURSOR_API_KEY!,
      },
      sudo: false,
      detached: true,
      cwd: PROJECT_DIR,
      stdout: captureStdout,
      stderr: captureStderr,
    })

    if (logger) {
      await logger.info('Cursor command started with output capture, monitoring for completion...')
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
        await logger.info('Cursor completed successfully')
      }
    } else {
      if (logger) {
        await logger.info('Cursor execution ended, checking for changes')
      }
    }

    const result = {
      success: true, // We'll determine actual success based on git changes
      output: capturedOutput,
      error: capturedError,
      command: logCommand,
    }

    // Log the output and error results (similar to Claude)
    // Skip logging raw output when streaming to database (we've already built clean content there)
    if (result.output && result.output.trim() && !agentMessageId) {
      const redactedOutput = redactSensitiveInfo(result.output.trim())
      await logger.info(redactedOutput)
    }

    if (result.error && result.error.trim()) {
      const redactedError = redactSensitiveInfo(result.error)
      await logger.error(redactedError)
    }

    // Cursor CLI execution completed

    // Session ID is now extracted during streaming parse above

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    // Success is determined by the CLI execution, not by code changes
    // Sometimes users just ask questions and no code changes are expected
    return {
      success: true,
      output: `Cursor CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
      // When streaming to DB, agentResponse is already in chat; omit it here
      agentResponse: agentMessageId ? undefined : result.output || 'Cursor CLI completed the task',
      cliName: 'cursor',
      changesDetected: !!hasChanges,
      error: undefined,
      sessionId: extractedSessionId, // Include session_id for resumption
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute Cursor CLI in sandbox'
    return {
      success: false,
      error: errorMessage,
      cliName: 'cursor',
      changesDetected: false,
    }
  }
}
