import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo, createCommandLog, createInfoLog, createErrorLog } from '@/lib/utils/logging'
import { LogEntry } from '@/lib/db/schema'
import { TaskLogger } from '@/lib/utils/task-logger'

// Helper function to run command and collect logs
async function runAndLogCommand(
  sandbox: Sandbox,
  command: string,
  args: string[],
  logs: LogEntry[],
  logger?: TaskLogger,
) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  // Log to both local logs and database if logger is provided
  logs.push(createCommandLog(redactedCommand))
  if (logger) {
    await logger.command(redactedCommand)
  }

  const result = await runCommandInSandbox(sandbox, command, args)

  // Only try to access properties if result is valid
  if (result && result.output && result.output.trim()) {
    const redactedOutput = redactSensitiveInfo(result.output.trim())
    logs.push(createInfoLog(redactedOutput))
    if (logger) {
      await logger.info(redactedOutput)
    }
  }

  if (result && !result.success && result.error) {
    const redactedError = redactSensitiveInfo(result.error)
    logs.push(createErrorLog(redactedError))
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
    logs.push(createErrorLog('Command execution failed - no result returned'))
    if (logger) {
      await logger.error('Command execution failed - no result returned')
    }
    return errorResult
  }

  return result
}

export async function installClaudeCLI(
  sandbox: Sandbox,
  selectedModel?: string,
): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = []

  // Install Claude CLI
  logs.push('Installing Claude CLI...')
  const claudeInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', '@anthropic-ai/claude-code'])

  if (claudeInstall.success) {
    logs.push('Claude CLI installed successfully')

    // Authenticate Claude CLI with API key
    if (process.env.ANTHROPIC_API_KEY) {
      logs.push('Authenticating Claude CLI...')

      // Create Claude config directory (use $HOME instead of ~)
      await runCommandInSandbox(sandbox, 'mkdir', ['-p', '$HOME/.config/claude'])

      // Create config file directly using absolute path
      // Use selectedModel if provided, otherwise fall back to default
      const modelToUse = selectedModel || 'claude-3-5-sonnet-20241022'
      const configFileCmd = `mkdir -p $HOME/.config/claude && cat > $HOME/.config/claude/config.json << 'EOF'
{
  "api_key": "${process.env.ANTHROPIC_API_KEY}",
  "default_model": "${modelToUse}"
}
EOF`
      const configFileResult = await runCommandInSandbox(sandbox, 'sh', ['-c', configFileCmd])

      if (configFileResult.success) {
        logs.push('Claude CLI config file created successfully')
      } else {
        logs.push('Warning: Failed to create Claude CLI config file')
      }

      // Verify authentication
      const verifyAuth = await runCommandInSandbox(sandbox, 'sh', [
        '-c',
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY} claude --version`,
      ])
      if (verifyAuth.success) {
        logs.push('Claude CLI authentication verified')
      } else {
        logs.push('Warning: Claude CLI authentication could not be verified')
      }
    } else {
      logs.push('Warning: ANTHROPIC_API_KEY not found, Claude CLI may not work')
    }

    return { success: true, logs }
  } else {
    logs.push('Failed to install Claude CLI')
    return { success: false, logs }
  }
}

export async function executeClaudeInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger?: TaskLogger,
  selectedModel?: string,
): Promise<AgentExecutionResult> {
  const logs: LogEntry[] = []

  try {
    // Executing Claude CLI with instruction

    // Check if Claude CLI is available and get version info
    const cliCheck = await runAndLogCommand(sandbox, 'which', ['claude'], logs, logger)

    if (cliCheck.success) {
      // Get Claude CLI version for debugging
      await runAndLogCommand(sandbox, 'claude', ['--version'], logs, logger)
      // Also try to see what commands are available
      await runAndLogCommand(sandbox, 'claude', ['--help'], logs, logger)
    }

    if (!cliCheck.success) {
      // Claude CLI not found, try to install it
      // Claude CLI not found, installing
      const installResult = await installClaudeCLI(sandbox, selectedModel)

      if (!installResult.success) {
        // Convert installation logs to LogEntry format
        const installLogs = installResult.logs.map((log) => createInfoLog(log))
        return {
          success: false,
          error: `Failed to install Claude CLI: ${installResult.logs.join(', ')}`,
          cliName: 'claude',
          changesDetected: false,
          logs: [...logs, ...installLogs],
        }
      }

      // Add installation logs to our logs (convert string logs to LogEntry)
      installResult.logs.forEach((log) => {
        logs.push(createInfoLog(log))
      })
      // Claude CLI installed successfully

      // Verify installation worked
      const verifyCheck = await runAndLogCommand(sandbox, 'which', ['claude'], logs, logger)
      if (!verifyCheck.success) {
        return {
          success: false,
          error: 'Claude CLI installation completed but CLI still not found',
          cliName: 'claude',
          changesDetected: false,
          logs,
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
        logs,
      }
    }

    // Execute Claude CLI with proper environment and instruction
    const envPrefix = `ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`

    // Log what we're trying to do
    const modelToUse = selectedModel || 'claude-3-5-sonnet-20241022'
    if (logger) {
      await logger.info(
        `Attempting to execute Claude CLI with model ${modelToUse} and instruction: ${instruction.substring(0, 100)}...`,
      )
    }

    // Try multiple command formats to see what works
    // First try: Simple direct command with permissions flag, model specification, and verbose output
    const fullCommand = `${envPrefix} claude --model "${modelToUse}" --dangerously-skip-permissions --verbose "${instruction}"`

    if (logger) {
      await logger.info('Executing Claude CLI with --dangerously-skip-permissions for automated file changes...')
    }

    // Log the command we're about to execute (with redacted API key)
    const redactedCommand = fullCommand.replace(process.env.ANTHROPIC_API_KEY!, '[REDACTED]')
    logs.push(createCommandLog(redactedCommand))
    if (logger) {
      await logger.command(redactedCommand)
    }

    const result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

    // Check if result is valid before accessing properties
    if (!result) {
      const errorMsg = 'Claude CLI execution failed - no result returned'
      logs.push(createErrorLog(errorMsg))
      if (logger) {
        await logger.error(errorMsg)
      }
      return {
        success: false,
        error: errorMsg,
        cliName: 'claude',
        changesDetected: false,
        logs,
      }
    }

    // Log the output
    if (result.output && result.output.trim()) {
      const redactedOutput = redactSensitiveInfo(result.output.trim())
      logs.push(createInfoLog(redactedOutput))
      if (logger) {
        await logger.info(redactedOutput)
      }
    }

    if (!result.success && result.error) {
      const redactedError = redactSensitiveInfo(result.error)
      logs.push(createErrorLog(redactedError))
      if (logger) {
        await logger.error(redactedError)
      }
    }

    // Claude CLI execution completed

    // Log more details for debugging
    if (logger) {
      await logger.info(`Claude CLI exit code: ${result.exitCode}`)
      if (result.output) {
        await logger.info(`Claude CLI output length: ${result.output.length} characters`)
      }
      if (result.error) {
        await logger.error(`Claude CLI error: ${result.error}`)
      }
    }

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logs, logger)

    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    if (result.success || result.exitCode === 0) {
      // Log additional debugging info if no changes were made
      if (!hasChanges) {
        if (logger) {
          await logger.info('No changes detected. Checking if files exist...')
        }

        // Check if common files exist
        await runAndLogCommand(
          sandbox,
          'find',
          ['.', '-name', 'README*', '-o', '-name', 'readme*'],
          logs,
          logger,
        )
        await runAndLogCommand(sandbox, 'ls', ['-la'], logs, logger)
      }

      return {
        success: true,
        output: `Claude CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
        agentResponse: result.output || 'No detailed response available',
        cliName: 'claude',
        changesDetected: !!hasChanges,
        error: undefined,
        logs,
      }
    } else {
      return {
        success: false,
        error: `Claude CLI failed (exit code ${result.exitCode}): ${result.error || 'No error message'}`,
        agentResponse: result.output,
        cliName: 'claude',
        changesDetected: !!hasChanges,
        logs,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute Claude CLI in sandbox'
    return {
      success: false,
      error: errorMessage,
      cliName: 'claude',
      changesDetected: false,
      logs,
    }
  }
}
