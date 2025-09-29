import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'

// Helper function to run command and collect logs
async function runAndLogCommand(sandbox: Sandbox, command: string, args: string[], logger: TaskLogger) {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
  const redactedCommand = redactSensitiveInfo(fullCommand)

  // Log to both local logs and database if logger is provided
  await logger.command(redactedCommand)
  if (logger) {
    await logger.command(redactedCommand)
  }

  const result = await runCommandInSandbox(sandbox, command, args)

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
): Promise<{ success: boolean }> {
  // Install Claude CLI
  await logger.info('Installing Claude CLI...')
  const claudeInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', '@anthropic-ai/claude-code'])

  if (claudeInstall.success) {
    await logger.info('Claude CLI installed successfully')

    // Authenticate Claude CLI with API key
    if (process.env.ANTHROPIC_API_KEY) {
      await logger.info('Authenticating Claude CLI...')

      // Create Claude config directory (use $HOME instead of ~)
      await runCommandInSandbox(sandbox, 'mkdir', ['-p', '$HOME/.config/claude'])

      // Create config file directly using absolute path
      // Use selectedModel if provided, otherwise fall back to default
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
): Promise<AgentExecutionResult> {
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
      const installResult = await installClaudeCLI(sandbox, logger, selectedModel)

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

    // Execute Claude CLI with proper environment and instruction
    const envPrefix = `ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`

    // Log what we're trying to do
    const modelToUse = selectedModel || 'claude-sonnet-4-5-20250929'
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
    await logger.command(redactedCommand)
    if (logger) {
      await logger.command(redactedCommand)
    }

    const result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

    // Check if result is valid before accessing properties
    if (!result) {
      const errorMsg = 'Claude CLI execution failed - no result returned'
      await logger.error(errorMsg)
      if (logger) {
        await logger.error(errorMsg)
      }
      return {
        success: false,
        error: errorMsg,
        cliName: 'claude',
        changesDetected: false,
      }
    }

    // Log the output
    if (result.output && result.output.trim()) {
      const redactedOutput = redactSensitiveInfo(result.output.trim())
      await logger.info(redactedOutput)
      if (logger) {
        await logger.info(redactedOutput)
      }
    }

    if (!result.success && result.error) {
      const redactedError = redactSensitiveInfo(result.error)
      await logger.error(redactedError)
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
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)

    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    if (result.success || result.exitCode === 0) {
      // Log additional debugging info if no changes were made
      if (!hasChanges) {
        if (logger) {
          await logger.info('No changes detected. Checking if files exist...')
        }

        // Check if common files exist
        await runAndLogCommand(sandbox, 'find', ['.', '-name', 'README*', '-o', '-name', 'readme*'], logger)
        await runAndLogCommand(sandbox, 'ls', ['-la'], logger)
      }

      return {
        success: true,
        output: `Claude CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
        agentResponse: result.output || 'No detailed response available',
        cliName: 'claude',
        changesDetected: !!hasChanges,
        error: undefined,
      }
    } else {
      return {
        success: false,
        error: `Claude CLI failed (exit code ${result.exitCode}): ${result.error || 'No error message'}`,
        agentResponse: result.output,
        cliName: 'claude',
        changesDetected: !!hasChanges,
      }
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
