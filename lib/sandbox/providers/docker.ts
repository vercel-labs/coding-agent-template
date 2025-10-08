import { SandboxProvider, SandboxConfig, SandboxInstance, SandboxResult, ExecutionResult } from './types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { AgentType } from '../agents'
import { Connector } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Docker = any
type Container = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export class DockerSandboxProvider implements SandboxProvider {
  readonly type = 'docker' as const
  private docker: Docker | null = null

  private async getDocker(): Promise<Docker> {
    if (this.docker) return this.docker

    try {
      const dockerode = await import('dockerode')
      this.docker = new dockerode.default()
      return this.docker
    } catch {
      throw new Error('Docker SDK not available. Please install dockerode: pnpm add dockerode')
    }
  }

  async checkDockerAvailable(): Promise<{ available: boolean; error?: string }> {
    try {
      const docker = await this.getDocker()
      await docker.ping()
      return { available: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        available: false,
        error: `Docker daemon not available: ${errorMessage}. Please ensure Docker Desktop is running.`,
      }
    }
  }

  async create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
    try {
      await logger.info('Checking Docker daemon availability...')
      const dockerCheck = await this.checkDockerAvailable()

      if (!dockerCheck.available) {
        return {
          success: false,
          error: dockerCheck.error,
        }
      }

      await logger.info('Docker daemon is available')

      if (config.onProgress) {
        await config.onProgress(20, 'Creating Docker container...')
      }

      const workDir = path.join(os.tmpdir(), 'coding-agent', config.taskId)

      // Clean up any existing directory first
      try {
        await fs.rm(workDir, { recursive: true, force: true })
      } catch {
        // Ignore errors if directory doesn't exist
      }

      await fs.mkdir(workDir, { recursive: true })

      await logger.info(`Created work directory: ${workDir}`)

      if (config.repoUrl) {
        await logger.info('Cloning repository into work directory...')

        const gitCloneCmd = `git clone ${config.repoUrl} ${workDir}/repo`
        await logger.command(gitCloneCmd.replace(process.env.GITHUB_TOKEN || '', '***'))

        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)

        try {
          await execAsync(gitCloneCmd, { timeout: 60000 })
          await logger.success('Repository cloned successfully')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          throw new Error(`Failed to clone repository: ${errorMessage}`)
        }
      }

      if (config.onCancellationCheck && (await config.onCancellationCheck())) {
        await logger.info('Task was cancelled before container creation')
        await fs.rm(workDir, { recursive: true, force: true })
        return { success: false, cancelled: true }
      }

      if (config.onProgress) {
        await config.onProgress(30, 'Pulling Docker image...')
      }

      await logger.info('Pulling node:22 image...')

      try {
        await this.pullImage('node:22', logger)
      } catch {
        await logger.info('Failed to pull image, will try to use cached version')
      }

      if (config.onProgress) {
        await config.onProgress(40, 'Starting Docker container...')
      }

      const containerName = `coding-agent-${config.taskId}`
      const docker = await this.getDocker()

      const container = await docker.createContainer({
        Image: 'node:22',
        name: containerName,
        Tty: true,
        OpenStdin: true,
        WorkingDir: '/workspace',
        HostConfig: {
          Binds: [`${workDir}/repo:/workspace`],
          AutoRemove: false,
          Memory: 4 * 1024 * 1024 * 1024,
          CpuQuota: 400000,
        },
        Env: [
          'GITHUB_TOKEN=' + (process.env.GITHUB_TOKEN || ''),
          'CLAUDE_CODE_OAUTH_TOKEN=' + (process.env.CLAUDE_CODE_OAUTH_TOKEN || ''),
          'ANTHROPIC_API_KEY=' + (process.env.ANTHROPIC_API_KEY || ''),
          'NODE_ENV=development',
        ],
      })

      await container.start()
      await logger.success(`Docker container started: ${containerName}`)

      if (config.onProgress) {
        await config.onProgress(45, 'Installing Git in container...')
      }

      await this.execInContainer(container, ['apt-get', 'update'], logger)
      await this.execInContainer(container, ['apt-get', 'install', '-y', 'git'], logger)

      await this.execInContainer(container, ['git', 'config', '--global', 'user.name', 'Coding Agent'], logger)
      await this.execInContainer(container, ['git', 'config', '--global', 'user.email', 'agent@example.com'], logger)

      if (config.installDependencies !== false && config.repoUrl) {
        const packageJsonExists = await this.fileExistsInContainer(container, 'package.json')

        if (packageJsonExists) {
          if (config.onProgress) {
            await config.onProgress(50, 'Installing npm dependencies...')
          }

          await logger.info('Installing npm dependencies...')
          try {
            await this.execInContainer(container, ['npm', 'install'], logger)
            await logger.success('Dependencies installed successfully')
          } catch {
            await logger.info('Warning: Failed to install dependencies, continuing anyway')
          }
        }
      }

      const branchName =
        config.preDeterminedBranchName || config.existingBranchName || `agent/${Date.now()}-${generateId()}`

      if (config.existingBranchName) {
        await logger.info(`Checking out existing branch: ${config.existingBranchName}`)
        await this.execInContainer(container, ['git', 'checkout', config.existingBranchName], logger)
      } else if (config.preDeterminedBranchName) {
        await logger.info(`Creating new branch: ${config.preDeterminedBranchName}`)
        await this.execInContainer(container, ['git', 'checkout', '-b', config.preDeterminedBranchName], logger)
      }

      const sandboxInstance: SandboxInstance = {
        id: container.id,
        type: 'docker',
        metadata: {
          containerName,
          workDir,
          containerId: container.id,
        },
        nativeSandbox: container,
      }

      return {
        success: true,
        sandbox: sandboxInstance,
        branchName,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`Docker sandbox creation failed: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  private async pullImage(imageName: string, logger: TaskLogger): Promise<void> {
    const docker = await this.getDocker()

    return new Promise((resolve, reject) => {
      docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err)
          return
        }

        docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) reject(err)
            else resolve()
          },
          (event: { status?: string; progress?: string }) => {
            if (event.status) {
              logger.info(`Docker: ${event.status} ${event.progress || ''}`).catch(() => {})
            }
          },
        )
      })
    })
  }

  private async fileExistsInContainer(container: Container, filePath: string): Promise<boolean> {
    try {
      const exec = await container.exec({
        Cmd: ['test', '-f', filePath],
        AttachStdout: false,
        AttachStderr: false,
      })

      await exec.start({ Detach: false })
      const inspection = await exec.inspect()

      return inspection.ExitCode === 0
    } catch {
      return false
    }
  }

  private async execInContainer(
    container: Container,
    cmd: string[],
    logger: TaskLogger,
  ): Promise<{ exitCode: number; output: string }> {
    await logger.command(cmd.join(' '))

    // Ensure container.exec exists
    if (typeof container.exec !== 'function') {
      throw new Error('Container exec method not available. Container may not be properly initialized.')
    }

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    })

    const stream = await exec.start({ Detach: false, Tty: false })

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''

      // Demux the Docker stream (stdout/stderr are multiplexed)
      const docker = this.docker
      if (docker && docker.modem) {
        docker.modem.demuxStream(
          stream,
          // stdout handler
          {
            write: (chunk: Buffer) => {
              const text = chunk.toString('utf-8')
              stdout += text
            },
            end: () => {},
          },
          // stderr handler
          {
            write: (chunk: Buffer) => {
              const text = chunk.toString('utf-8')
              stderr += text
            },
            end: () => {},
          },
        )
      } else {
        // Fallback if demux not available
        stream.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8')
          stdout += text
        })
      }

      stream.on('end', async () => {
        const inspection = await exec.inspect()
        const exitCode = inspection.ExitCode || 0

        // Log stdout
        if (stdout.trim()) {
          await logger.info(stdout.trim())
        }

        // Log stderr as error if non-zero exit or as info if zero exit
        if (stderr.trim()) {
          if (exitCode !== 0) {
            await logger.error(stderr.trim())
          } else {
            await logger.info(stderr.trim())
          }
        }

        resolve({
          exitCode,
          output: stdout + stderr,
        })
      })

      stream.on('error', reject)
    })
  }

  private async getContainerFromSandbox(sandbox: SandboxInstance): Promise<Container> {
    const docker = await this.getDocker()

    // If nativeSandbox exists and has exec method, use it directly
    if (sandbox.nativeSandbox && typeof sandbox.nativeSandbox.exec === 'function') {
      return sandbox.nativeSandbox as Container
    }

    // Otherwise, recreate container from ID (needed after Inngest serialization)
    const containerId = (sandbox.metadata?.containerId as string) || sandbox.id
    const container = docker.getContainer(containerId)

    // Verify container exists and is running
    const inspection = await container.inspect()
    if (!inspection.State.Running) {
      throw new Error('Container is not running')
    }

    return container
  }

  async executeAgent(
    sandbox: SandboxInstance,
    instruction: string,
    agentType: AgentType,
    logger: TaskLogger,
    selectedModel?: string,
    _mcpServers?: Connector[],
    _onCancellationCheck?: () => Promise<boolean>,
  ): Promise<ExecutionResult> {
    try {
      await logger.info(`Executing ${agentType} agent in Docker container...`)

      const container = await this.getContainerFromSandbox(sandbox)

      const agentCommands = this.getAgentInstallCommands(agentType)

      for (const cmd of agentCommands) {
        await this.execInContainer(container, cmd, logger)
      }

      const executeCmd = this.getAgentExecuteCommand(agentType, instruction, selectedModel)
      const result = await this.execInContainer(container, executeCmd, logger)

      if (result.exitCode === 0) {
        return {
          success: true,
          output: result.output,
          exitCode: result.exitCode,
        }
      } else {
        return {
          success: false,
          error: `Agent execution failed with exit code ${result.exitCode}`,
          exitCode: result.exitCode,
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  private getAgentInstallCommands(agentType: AgentType): string[][] {
    switch (agentType) {
      case 'claude':
        return [['npm', 'install', '-g', '@anthropic-ai/claude-code']]
      case 'codex':
      case 'opencode':
        return [['npm', 'install', '-g', 'openai']]
      default:
        return []
    }
  }

  private getAgentExecuteCommand(agentType: AgentType, instruction: string, selectedModel?: string): string[] {
    switch (agentType) {
      case 'claude':
        // Use OAuth token if available, fall back to API key
        const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
        const apiKey = process.env.ANTHROPIC_API_KEY

        const modelArg = selectedModel ? `--model "${selectedModel}"` : ''

        // Prefer OAuth token, use API key as fallback
        let fullCommand: string
        if (oauthToken) {
          fullCommand = `CLAUDE_CODE_OAUTH_TOKEN="${oauthToken}" claude --print ${modelArg} "${instruction}"`
        } else if (apiKey) {
          fullCommand = `ANTHROPIC_API_KEY="${apiKey}" claude --print ${modelArg} "${instruction}"`
        } else {
          fullCommand = `claude --print ${modelArg} "${instruction}"`
        }

        return ['sh', '-c', fullCommand]
      case 'codex':
        return ['npx', 'openai', 'execute', instruction]
      default:
        return ['echo', instruction]
    }
  }

  async pushChanges(
    sandbox: SandboxInstance,
    branchName: string,
    commitMessage: string,
    logger: TaskLogger,
  ): Promise<{ success: boolean; pushFailed?: boolean }> {
    try {
      const container = await this.getContainerFromSandbox(sandbox)

      const statusResult = await this.execInContainer(
        container,
        ['git', '-C', '/tmp/workspace', 'status', '--porcelain'],
        logger,
      )

      if (!statusResult.output?.trim()) {
        await logger.info('No changes to commit')
        return { success: true }
      }

      await logger.info('Changes detected, committing...')

      await this.execInContainer(container, ['git', '-C', '/tmp/workspace', 'add', '.'], logger)
      await logger.info('Changes staged')

      await this.execInContainer(container, ['git', '-C', '/tmp/workspace', 'commit', '-m', commitMessage], logger)
      await logger.info('Changes committed successfully')

      const pushResult = await this.execInContainer(
        container,
        ['git', '-C', '/tmp/workspace', 'push', 'origin', branchName],
        logger,
      )

      if (pushResult.exitCode !== 0) {
        await logger.error('Failed to push changes')
        return { success: true, pushFailed: true }
      }

      await logger.success(`Successfully pushed changes to branch: ${branchName}`)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`Failed to push changes: ${errorMessage}`)
      return { success: true, pushFailed: true }
    }
  }

  async destroy(sandbox: SandboxInstance, logger: TaskLogger): Promise<{ success: boolean; error?: string }> {
    try {
      await logger.info('Stopping Docker container...')

      const container = await this.getContainerFromSandbox(sandbox)

      try {
        await container.stop({ t: 10 })
      } catch (error) {
        // Container might already be stopped
        await logger.info('Container already stopped or stopping failed, continuing...')
      }

      await logger.info('Removing Docker container...')
      await container.remove()

      if (sandbox.metadata?.workDir) {
        await logger.info('Cleaning up work directory...')
        await fs.rm(sandbox.metadata.workDir as string, { recursive: true, force: true })
      }

      await logger.success('Docker sandbox destroyed successfully')

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`Failed to destroy Docker sandbox: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }
}
