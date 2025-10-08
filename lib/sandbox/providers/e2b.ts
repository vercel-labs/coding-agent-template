import { SandboxProvider, SandboxConfig, SandboxInstance, SandboxResult, ExecutionResult } from './types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { AgentType } from '../agents'
import { Connector } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

/* eslint-disable @typescript-eslint/no-explicit-any */
type E2BSandbox = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export class E2BSandboxProvider implements SandboxProvider {
  readonly type = 'e2b' as const

  private async getE2B(): Promise<typeof import('@e2b/code-interpreter')> {
    try {
      const e2b = await import('@e2b/code-interpreter')
      return e2b
    } catch {
      throw new Error('E2B SDK not available. Please install: pnpm add @e2b/code-interpreter')
    }
  }

  async create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
    try {
      if (!process.env.E2B_API_KEY) {
        return {
          success: false,
          error: 'E2B_API_KEY environment variable is required',
        }
      }

      await logger.info('Creating E2B sandbox...')

      if (config.onProgress) {
        await config.onProgress(20, 'Initializing E2B sandbox...')
      }

      const { Sandbox } = await this.getE2B()

      // Create E2B code interpreter sandbox
      const sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY,
        metadata: {
          taskId: config.taskId,
        },
      })

      await logger.success(`E2B sandbox created: ${sandbox.sandboxId}`)

      if (config.onProgress) {
        await config.onProgress(40, 'Setting up repository...')
      }

      // Clone repository if provided
      if (config.repoUrl) {
        await logger.info('Cloning repository...')

        const cloneCmd = `git clone ${config.repoUrl} /home/user/project`
        const cloneResult = await sandbox.runCode(cloneCmd, {
          language: 'bash',
          timeoutMs: 300_000, // 5 minutes for git clone
        })

        if (cloneResult.error) {
          throw new Error(`Failed to clone repository: ${cloneResult.error.value}`)
        }

        await logger.success('Repository cloned successfully')
      }

      if (config.onProgress) {
        await config.onProgress(50, 'Installing dependencies...')
      }

      // Install dependencies if requested
      if (config.installDependencies !== false && config.repoUrl) {
        await logger.info('Installing dependencies...')

        const installResult = await sandbox.runCode('cd /home/user/project && npm install', {
          language: 'bash',
          timeoutMs: 600_000, // 10 minutes for npm install
        })

        if (!installResult.error) {
          await logger.success('Dependencies installed successfully')
        } else {
          await logger.info('Warning: Failed to install dependencies, continuing anyway')
        }
      }

      // Set up git branch
      const branchName =
        config.preDeterminedBranchName || config.existingBranchName || `agent/${Date.now()}-${generateId()}`

      if (config.existingBranchName) {
        await logger.info(`Checking out existing branch: ${config.existingBranchName}`)
        await sandbox.runCode(`cd /home/user/project && git checkout ${config.existingBranchName}`, {
          language: 'bash',
          timeoutMs: 60_000,
        })
      } else if (config.preDeterminedBranchName) {
        await logger.info(`Creating new branch: ${config.preDeterminedBranchName}`)
        await sandbox.runCode(`cd /home/user/project && git checkout -b ${config.preDeterminedBranchName}`, {
          language: 'bash',
          timeoutMs: 60_000,
        })
      }

      const sandboxInstance: SandboxInstance = {
        id: sandbox.sandboxId,
        type: 'e2b',
        metadata: {
          sandboxId: sandbox.sandboxId,
        },
        nativeSandbox: sandbox,
      }

      return {
        success: true,
        sandbox: sandboxInstance,
        branchName,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`E2B sandbox creation failed: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  private async getSandboxFromInstance(sandbox: SandboxInstance): Promise<E2BSandbox> {
    // If nativeSandbox exists and has runCode method, use it directly
    if (sandbox.nativeSandbox && typeof sandbox.nativeSandbox.runCode === 'function') {
      return sandbox.nativeSandbox as E2BSandbox
    }

    // Otherwise, connect to the existing sandbox using its ID (needed after Inngest serialization)
    const { Sandbox } = await this.getE2B()
    const sandboxId = (sandbox.metadata?.sandboxId as string) || sandbox.id

    // Use the code interpreter Sandbox.connect() - it inherits from base e2b Sandbox
    const reconnectedSandbox = await Sandbox.connect(sandboxId, {
      apiKey: process.env.E2B_API_KEY,
    })

    return reconnectedSandbox as E2BSandbox
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
      await logger.info(`Executing ${agentType} agent in E2B sandbox...`)

      // Get the sandbox from instance (handles serialization)
      const e2bSandbox = await this.getSandboxFromInstance(sandbox)

      // Install agent CLI
      const installCmd = this.getAgentInstallCommand(agentType)
      if (installCmd) {
        await logger.info(`Installing ${agentType} CLI...`)
        const installResult = await e2bSandbox.runCode(installCmd, {
          language: 'bash',
          timeoutMs: 300_000, // 5 minutes for CLI installation
        })

        if (installResult.error) {
          throw new Error(`Failed to install ${agentType} CLI: ${installResult.error.value}`)
        }
      }

      // Execute agent
      const executeCmd = this.getAgentExecuteCommand(agentType, instruction, selectedModel)
      await logger.command(executeCmd)

      const result = await e2bSandbox.runCode(`cd /home/user/project && ${executeCmd}`, {
        language: 'bash',
        timeoutMs: 1_800_000, // 30 minutes for agent execution
      })

      if (result.text) {
        await logger.info(result.text)
      }

      if (result.error) {
        await logger.error(result.error.value)
        return {
          success: false,
          error: result.error.value,
        }
      }

      return {
        success: true,
        output: result.text || 'Agent execution completed',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  private getAgentInstallCommand(agentType: AgentType): string | null {
    switch (agentType) {
      case 'claude':
        return 'npm install -g @anthropic-ai/claude-code'
      case 'codex':
      case 'opencode':
        return 'npm install -g openai'
      default:
        return null
    }
  }

  private getAgentExecuteCommand(agentType: AgentType, instruction: string, selectedModel?: string): string {
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
    const apiKey = process.env.ANTHROPIC_API_KEY

    switch (agentType) {
      case 'claude': {
        const modelArg = selectedModel ? `--model "${selectedModel}"` : ''
        if (oauthToken) {
          return `CLAUDE_CODE_OAUTH_TOKEN="${oauthToken}" claude --print ${modelArg} "${instruction}"`
        } else if (apiKey) {
          return `ANTHROPIC_API_KEY="${apiKey}" claude --print ${modelArg} "${instruction}"`
        } else {
          return `claude --print ${modelArg} "${instruction}"`
        }
      }
      case 'codex':
        return `openai execute "${instruction}"`
      default:
        return `echo "${instruction}"`
    }
  }

  async pushChanges(
    sandbox: SandboxInstance,
    branchName: string,
    commitMessage: string,
    logger: TaskLogger,
  ): Promise<{ success: boolean; pushFailed?: boolean }> {
    try {
      const e2bSandbox = await this.getSandboxFromInstance(sandbox)

      const statusResult = await e2bSandbox.runCode('cd /home/user/project && git status --porcelain', {
        language: 'bash',
        timeoutMs: 30_000,
      })

      if (!statusResult.text?.trim()) {
        await logger.info('No changes to commit')
        return { success: true }
      }

      await logger.info('Changes detected, committing...')

      const addResult = await e2bSandbox.runCode('cd /home/user/project && git add .', {
        language: 'bash',
        timeoutMs: 60_000,
      })

      if (addResult.error) {
        throw new Error(`Failed to stage changes: ${addResult.error.value}`)
      }

      await logger.info('Changes staged')

      const commitResult = await e2bSandbox.runCode(
        `cd /home/user/project && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
        {
          language: 'bash',
          timeoutMs: 60_000,
        },
      )

      if (commitResult.error) {
        throw new Error(`Failed to commit: ${commitResult.error.value}`)
      }

      await logger.info('Changes committed successfully')

      const pushResult = await e2bSandbox.runCode(`cd /home/user/project && git push origin ${branchName}`, {
        language: 'bash',
        timeoutMs: 120_000,
      })

      if (pushResult.error) {
        const errorMsg = pushResult.error.value || 'Unknown error'
        await logger.error(`Failed to push: ${errorMsg}`)

        if (errorMsg.includes('Permission') || errorMsg.includes('403')) {
          await logger.info('Note: Permission issue - changes committed locally but not pushed')
        }

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
      await logger.info('Closing E2B sandbox...')

      const e2bSandbox = await this.getSandboxFromInstance(sandbox)

      if (e2bSandbox && typeof e2bSandbox.close === 'function') {
        await e2bSandbox.close()
        await logger.success('E2B sandbox closed successfully')
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`Failed to close E2B sandbox: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }
}
