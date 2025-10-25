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

// Helper function to run command and collect logs in project directory
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

export async function executeCopilotInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
): Promise<AgentExecutionResult> {
  let agentMessageId: string | null = null
  let accumulatedContent = ''

  try {
    // Check if GitHub Copilot CLI is already installed (for resumed sandboxes)
    const existingCliCheck = await runCommandInSandbox(sandbox, 'sh', ['-c', 'which copilot 2>/dev/null'])

    let copilotInstall: { success: boolean; output?: string; error?: string } = { success: true }

    if (existingCliCheck.success && existingCliCheck.output?.includes('copilot')) {
      // CLI already installed, skip installation
      if (logger) {
        await logger.info('GitHub Copilot CLI already installed, skipping installation')
      }
    } else {
      // Install GitHub Copilot CLI using npm
      if (logger) {
        await logger.info('Installing GitHub Copilot CLI...')
      }

      // Install using npm global
      copilotInstall = await runAndLogCommand(sandbox, 'npm', ['install', '-g', '@github/copilot'], logger)

      if (!copilotInstall.success) {
        const errorMsg = 'Failed to install GitHub Copilot CLI'
        if (logger) {
          await logger.error(errorMsg)
        }
        return {
          success: false,
          error: errorMsg,
          cliName: 'copilot',
          changesDetected: false,
        }
      }
    }

    await logger.info('GitHub Copilot CLI installed successfully')

    // Check if Copilot CLI is available
    const cliCheck = await runAndLogCommand(sandbox, 'which', ['copilot'], logger)

    if (!cliCheck.success) {
      return {
        success: false,
        error: 'GitHub Copilot CLI not found after installation',
        cliName: 'copilot',
        changesDetected: false,
      }
    }

    // Check if GH_TOKEN or GITHUB_TOKEN is available
    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
      return {
        success: false,
        error: 'GH_TOKEN or GITHUB_TOKEN environment variable is required but not found',
        cliName: 'copilot',
        changesDetected: false,
      }
    }

    // Configure MCP servers if provided
    if (mcpServers && mcpServers.length > 0) {
      await logger.info('Configuring MCP servers for GitHub Copilot')

      // Create MCP configuration file for Copilot
      const mcpConfig: {
        mcpServers: Record<
          string,
          | { type: 'http'; url: string; headers?: Record<string, string>; tools: string[] }
          | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>; tools: string[] }
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
            type: 'stdio',
            command: executable,
            ...(args.length > 0 ? { args } : {}),
            ...(envObject ? { env: envObject } : {}),
            tools: [], // Empty array to allow all tools
          }
          await logger.info('Added local MCP server')
        } else {
          // Remote HTTP/SSE server
          const headers: Record<string, string> = {}
          if (server.oauthClientSecret) {
            headers.Authorization = `Bearer ${server.oauthClientSecret}`
          }
          if (server.oauthClientId) {
            headers['X-Client-ID'] = server.oauthClientId
          }

          const httpConfig: { type: 'http'; url: string; headers?: Record<string, string>; tools: string[] } = {
            type: 'http',
            url: server.baseUrl!,
            tools: [], // Empty array to allow all tools
          }

          if (Object.keys(headers).length > 0) {
            httpConfig.headers = headers
          }

          mcpConfig.mcpServers[serverName] = httpConfig

          await logger.info('Added remote MCP server')
        }
      }

      // Write the MCP configuration file (use $HOME instead of ~)
      const mcpConfigJson = JSON.stringify(mcpConfig, null, 2)
      const createMcpConfigCmd = `mkdir -p $HOME/.copilot && cat > $HOME/.copilot/mcp-config.json << 'EOF'
${mcpConfigJson}
EOF`

      await logger.info('Creating GitHub Copilot MCP configuration file...')
      const mcpConfigResult = await runCommandInSandbox(sandbox, 'sh', ['-c', createMcpConfigCmd])

      if (mcpConfigResult.success) {
        await logger.info('MCP configuration file created successfully')
      } else {
        await logger.info('Warning: Failed to create MCP configuration file')
      }
    }

    // Execute GitHub Copilot CLI with the instruction
    if (logger) {
      await logger.info('Starting GitHub Copilot CLI execution...')
    }

    // Capture output by intercepting the streams
    let capturedOutput = ''
    let capturedError = ''

    // Create custom writable streams to capture the output
    const { Writable } = await import('stream')

    interface WriteCallback {
      (error?: Error | null): void
    }

    let extractedSessionId: string | undefined

    const captureStdout = new Writable({
      write(chunk: Buffer | string, encoding: BufferEncoding, callback: WriteCallback) {
        const data = chunk.toString()

        // Only capture raw output if we're NOT streaming to database
        if (!agentMessageId || !taskId) {
          capturedOutput += data
        }

        // Parse text-based streaming output with --no-color
        // GitHub Copilot CLI outputs lines with different prefixes:
        // ● = thought/status, ✓ = completed action, $ = command, ╭─ = diff start, etc.
        // Filter out the diff boxes (lines containing ╭, ╰, │, ─, ═) to keep output clean
        if (agentMessageId && taskId) {
          const lines = data.split('\n')
          for (const line of lines) {
            if (line.trim()) {
              // Skip diff box lines (containing box drawing characters)
              const isDiffBox = /[╭╰│─═╮╯]/.test(line)

              if (!isDiffBox) {
                // Check if this is a new action line (starts with ● or ✓)
                const isActionLine = /^[●✓]/.test(line.trim())

                // Add blank line before action lines for better readability
                if (isActionLine && accumulatedContent.length > 0) {
                  accumulatedContent += '\n'
                }

                // Append each line to accumulated content
                accumulatedContent += line + '\n'

                // Update database with accumulated content (throttled via catch)
                db.update(taskMessages)
                  .set({ content: accumulatedContent })
                  .where(eq(taskMessages.id, agentMessageId))
                  .catch((err: Error) => {
                    // Silently ignore update errors to avoid flooding logs
                  })
              }
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

    // Create initial agent message in database if taskId provided
    if (taskId) {
      agentMessageId = generateId(12)
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: '<pre class="whitespace-pre-wrap font-sans text-xs">',
      })
      // Initialize accumulated content with opening pre tag
      accumulatedContent = '<pre class="whitespace-pre-wrap font-sans text-xs">'
    }

    // Build the copilot command
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    const homeDir = '/home/vercel-sandbox'
    const mcpConfigPath = `${homeDir}/.copilot/mcp-config.json`
    const modelFlag = selectedModel ? ` --model ${selectedModel}` : ''
    const resumeFlag = isResumed && sessionId ? ` --resume ${sessionId}` : ''
    const additionalMcpConfig = mcpServers && mcpServers.length > 0 ? ` --additional-mcp-config @${mcpConfigPath}` : ''

    // Use non-interactive mode with --allow-all-tools and --no-color for streaming text output
    // Note: File paths in --additional-mcp-config must be prefixed with @
    const args = [
      '-p',
      instruction,
      '--allow-all-tools',
      '--no-color',
      ...(selectedModel ? ['--model', selectedModel] : []),
      ...(isResumed && sessionId ? ['--resume', sessionId] : []),
      ...(mcpServers && mcpServers.length > 0 ? ['--additional-mcp-config', `@${mcpConfigPath}`] : []),
    ]

    const logCommand = `copilot${modelFlag}${resumeFlag}${additionalMcpConfig} -p "${instruction}" --allow-all-tools --no-color`
    await logger.command(logCommand)

    if (logger) {
      await logger.info('Executing GitHub Copilot CLI in non-interactive mode')
    }

    // Execute copilot CLI (without detached mode so we can wait for completion)
    try {
      await sandbox.runCommand({
        cmd: 'copilot',
        args: args,
        env: {
          GH_TOKEN: token!,
          GITHUB_TOKEN: token!,
        },
        sudo: false,
        cwd: PROJECT_DIR,
        stdout: captureStdout,
        stderr: captureStderr,
      })

      if (logger) {
        await logger.info('GitHub Copilot CLI execution completed')
      }
    } catch (error) {
      // Command may exit with non-zero code, but that's okay
      // We'll check for changes below
      if (logger) {
        await logger.info('GitHub Copilot CLI execution finished')
      }
    }

    const result = {
      success: true,
      output: capturedOutput,
      error: capturedError,
      command: logCommand,
    }

    // Log the output and error results
    if (result.output && result.output.trim() && !agentMessageId) {
      const redactedOutput = redactSensitiveInfo(result.output.trim())
      await logger.info(redactedOutput)
    }

    if (result.error && result.error.trim()) {
      const redactedError = redactSensitiveInfo(result.error)
      await logger.error(redactedError)
    }

    // Close the pre tag if streaming to database
    if (agentMessageId && taskId) {
      accumulatedContent += '</pre>'
      await db
        .update(taskMessages)
        .set({ content: accumulatedContent })
        .where(eq(taskMessages.id, agentMessageId))
        .catch((err: Error) => console.error('Failed to update message:', err))
    }

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    // Success is determined by the CLI execution, not by code changes
    // Sometimes users just ask questions and no code changes are expected
    return {
      success: true,
      output: `GitHub Copilot CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
      agentResponse: agentMessageId ? undefined : result.output || 'GitHub Copilot CLI completed the task',
      cliName: 'copilot',
      changesDetected: !!hasChanges,
      error: undefined,
      sessionId: extractedSessionId,
    }
  } catch (error: unknown) {
    // Close the pre tag if streaming to database and there was an error
    if (agentMessageId && taskId) {
      accumulatedContent += '</pre>'
      await db
        .update(taskMessages)
        .set({ content: accumulatedContent })
        .where(eq(taskMessages.id, agentMessageId))
        .catch((err: Error) => console.error('Failed to update message:', err))
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to execute GitHub Copilot CLI in sandbox'
    return {
      success: false,
      error: errorMessage,
      cliName: 'copilot',
      changesDetected: false,
    }
  }
}
