import { Sandbox } from '@vercel/sandbox'

// Project directory where repo is cloned
export const PROJECT_DIR = '/vercel/sandbox/project'

export interface CommandResult {
  success: boolean
  exitCode?: number
  output?: string
  error?: string
  streamingLogs?: unknown[]
  command?: string
}

export interface StreamingCommandOptions {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  onJsonLine?: (jsonData: unknown) => void
}

export async function runCommandInSandbox(
  sandbox: Sandbox,
  command: string,
  args: string[] = [],
): Promise<CommandResult> {
  try {
    const result = await sandbox.runCommand(command, args)

    // Handle stdout and stderr properly
    let stdout = ''
    let stderr = ''

    try {
      stdout = await (result.stdout as () => Promise<string>)()
    } catch {
      // Failed to read stdout
    }

    try {
      stderr = await (result.stderr as () => Promise<string>)()
    } catch {
      // Failed to read stderr
    }

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      output: stdout,
      error: stderr,
      command: fullCommand,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Command execution failed'
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
    return {
      success: false,
      error: errorMessage,
      command: fullCommand,
    }
  }
}

// Helper function to run command in project directory
export async function runInProject(sandbox: Sandbox, command: string, args: string[] = []): Promise<CommandResult> {
  // Properly escape arguments for shell execution
  const escapeArg = (arg: string) => {
    // Escape single quotes by replacing ' with '\''
    return `'${arg.replace(/'/g, "'\\''")}'`
  }

  const fullCommand = args.length > 0 ? `${command} ${args.map(escapeArg).join(' ')}` : command
  const cdCommand = `cd ${PROJECT_DIR} && ${fullCommand}`
  return await runCommandInSandbox(sandbox, 'sh', ['-c', cdCommand])
}

export async function runStreamingCommandInSandbox(
  sandbox: Sandbox,
  command: string,
  args: string[] = [],
  options: StreamingCommandOptions = {},
): Promise<CommandResult> {
  try {
    const result = await sandbox.runCommand(command, args)

    let stdout = ''
    let stderr = ''

    try {
      // stdout is always a function that returns a promise
      if (typeof result.stdout === 'function') {
        stdout = await result.stdout()
        // Process the complete output for JSON lines
        if (options.onJsonLine) {
          const lines = stdout.split('\n')
          for (const line of lines) {
            const trimmedLine = line.trim()
            if (trimmedLine) {
              try {
                const jsonData = JSON.parse(trimmedLine)
                options.onJsonLine(jsonData)
              } catch {
                // Not valid JSON, ignore
              }
            }
          }
        }
        if (options.onStdout) {
          options.onStdout(stdout)
        }
      }
    } catch {
      // Failed to read stdout
    }

    try {
      // stderr is always a function that returns a promise
      if (typeof result.stderr === 'function') {
        stderr = await result.stderr()
        if (options.onStderr) {
          options.onStderr(stderr)
        }
      }
    } catch {
      // Failed to read stderr
    }

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      output: stdout,
      error: stderr,
      command: fullCommand,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to run streaming command in sandbox'
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
    return {
      success: false,
      error: errorMessage,
      command: fullCommand,
    }
  }
}
