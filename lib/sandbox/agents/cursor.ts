import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from '../commands'
import { AgentExecutionResult } from '../types'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import { TaskLogger } from '@/lib/utils/task-logger'

// Helper function to run command and collect
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

export async function executeCursorInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
): Promise<AgentExecutionResult> {
  try {
    // Executing Cursor CLI with instruction

    // Install Cursor CLI using the official installer
    // Installing Cursor CLI
    if (logger) {
      await logger.info('Starting Cursor CLI installation...')
    }

    // Install Cursor CLI using the official installation script with timeout
    // Add debugging to see what the installation script does
    const installCommand = 'timeout 300 bash -c "curl https://cursor.com/install -fsS | bash -s -- --verbose"'
    const cursorInstall = await runAndLogCommand(sandbox, 'sh', ['-c', installCommand], logger)

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
      const checkResult = await runAndLogCommand(sandbox, 'sh', ['-c', checkCmd], logger)
      if (logger && checkResult.output) {
        await logger.info(`Post-install check "${checkCmd}": ${checkResult.output}`)
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
    const cliCheck = await runAndLogCommand(
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
        const searchResult = await runAndLogCommand(sandbox, 'sh', ['-c', searchCmd], logger)
        if (logger && searchResult.output) {
          await logger.info(`Search result for "${searchCmd}": ${searchResult.output}`)
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

    // Execute Cursor CLI with the instruction using print mode and force flag for file modifications
    if (logger) {
      await logger.info('Starting Cursor CLI execution with instruction...')
    }

    // Debug: Check if cursor-agent is still available right before execution
    const preExecCheck = await runAndLogCommand(
      sandbox,
      'sh',
      ['-c', 'export PATH="$HOME/.local/bin:$PATH"; which cursor-agent'],
      logger,
    )
    if (logger) {
      await logger.info(`Pre-execution cursor-agent check: ${preExecCheck.success ? 'FOUND' : 'NOT FOUND'}`)
      if (preExecCheck.output) {
        await logger.info(`cursor-agent location: ${preExecCheck.output}`)
      }
    }

    // Use the correct flags: -p for print mode (non-interactive), --force for file modifications
    // Try multiple approaches to find and execute cursor-agent
    let result

    // Log what we're about to execute
    const modelFlag = selectedModel ? ` --model ${selectedModel}` : ''
    const logCommand = `cursor-agent -p --force --output-format json${modelFlag} "${instruction}"`
    await logger.command(logCommand)
    if (logger) {
      await logger.command(logCommand)
      if (selectedModel) {
        await logger.info(`Executing cursor-agent with model: ${selectedModel}`)
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

    const captureStdout = new Writable({
      write(chunk: Buffer | string, encoding: BufferEncoding, callback: WriteCallback) {
        const data = chunk.toString()
        capturedOutput += data

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

    // Start the command with output capture
    // Add model parameter if provided
    const args = ['-p', '--force', '--output-format', 'json']
    if (selectedModel) {
      args.push('--model', selectedModel)
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
      stdout: captureStdout,
      stderr: captureStderr,
    })

    if (logger) {
      await logger.info('Cursor command started with output capture, monitoring for completion...')
    }

    // Poll for completion instead of waiting for the API
    let attempts = 0
    const maxAttempts = 60 // 60 seconds max

    while (!isCompleted && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait 1 second
      attempts++

      if (attempts % 10 === 0 && logger) {
        await logger.info(`Still waiting for completion... ${attempts}s elapsed`)
      }
    }

    if (isCompleted) {
      if (logger) {
        await logger.info(`Cursor completed successfully in ${attempts} seconds`)
      }

      result = {
        success: true,
        output: capturedOutput,
        error: capturedError,
        command: logCommand,
      }
    } else {
      if (logger) {
        await logger.info('Timeout waiting for completion, but may have succeeded')
      }

      result = {
        success: false,
        output: capturedOutput,
        error: capturedError || 'Timeout waiting for completion',
        command: logCommand,
      }
    }

    // Log the output and error results (similar to Claude)
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

    // Cursor CLI execution completed

    // Check if any files were modified
    const gitStatusCheck = await runAndLogCommand(sandbox, 'git', ['status', '--porcelain'], logger)
    const hasChanges = gitStatusCheck.success && gitStatusCheck.output?.trim()

    if (result.success) {
      return {
        success: true,
        output: `Cursor CLI executed successfully${hasChanges ? ' (Changes detected)' : ' (No changes made)'}`,
        agentResponse: result.output || 'Cursor CLI completed the task',
        cliName: 'cursor',
        changesDetected: !!hasChanges,
        error: undefined,
      }
    } else {
      return {
        success: false,
        error: `Cursor CLI failed: ${result.error || 'No error message'}`,
        agentResponse: result.output,
        cliName: 'cursor',
        changesDetected: !!hasChanges,
      }
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
