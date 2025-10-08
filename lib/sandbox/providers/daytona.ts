import { SandboxProvider, SandboxConfig, SandboxInstance, SandboxResult, ExecutionResult } from './types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { AgentType } from '../agents'
import { Connector } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

/* eslint-disable @typescript-eslint/no-explicit-any */
type DaytonaSandbox = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export class DaytonaSandboxProvider implements SandboxProvider {
  readonly type = 'daytona' as const

  private async getDaytona(): Promise<typeof import('@daytonaio/sdk')> {
    try {
      const daytona = await import('@daytonaio/sdk')
      return daytona
    } catch {
      throw new Error('Daytona SDK not available. Please install: pnpm add @daytonaio/sdk')
    }
  }

  async create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
    try {
      if (!process.env.DAYTONA_API_KEY) {
        return {
          success: false,
          error: 'DAYTONA_API_KEY environment variable is required',
        }
      }

      await logger.info('Creating Daytona sandbox...')

      if (config.onProgress) {
        await config.onProgress(20, 'Initializing Daytona sandbox...')
      }

      const { Daytona } = await this.getDaytona()

      const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })

      const sandbox = await daytona.create({
        language: 'typescript',
      })

      await logger.success(`Daytona sandbox created: ${sandbox.id}`)

      if (config.onProgress) {
        await config.onProgress(40, 'Setting up repository...')
      }

      const workDir = 'workspace/project'

      if (config.repoUrl) {
        await logger.info('Cloning repository...')

        await sandbox.git.clone(config.repoUrl, workDir)

        await logger.success('Repository cloned successfully')
      }

      if (config.onProgress) {
        await config.onProgress(50, 'Installing dependencies...')
      }

      if (config.installDependencies !== false && config.repoUrl) {
        await logger.info('Installing dependencies...')

        try {
          const installResult = await sandbox.process.executeCommand('npm install', workDir, undefined, 600)

          if (installResult.exitCode === 0) {
            await logger.success('Dependencies installed successfully')
          } else {
            await logger.info('Warning: Failed to install dependencies, continuing anyway')
          }
        } catch {
          await logger.info('Warning: Failed to install dependencies, continuing anyway')
        }
      }

      const branchName =
        config.preDeterminedBranchName || config.existingBranchName || `agent/${Date.now()}-${generateId()}`

      if (config.existingBranchName) {
        await logger.info(`Checking out existing branch: ${config.existingBranchName}`)
        await sandbox.git.checkoutBranch(workDir, config.existingBranchName)
      } else if (config.preDeterminedBranchName) {
        await logger.info(`Creating new branch: ${config.preDeterminedBranchName}`)
        await sandbox.git.createBranch(workDir, config.preDeterminedBranchName)
        await sandbox.git.checkoutBranch(workDir, config.preDeterminedBranchName)
      }

      const sandboxInstance: SandboxInstance = {
        id: sandbox.id,
        type: 'daytona',
        metadata: {
          sandboxId: sandbox.id,
          workDir,
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
      await logger.error(`Daytona sandbox creation failed: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  private async getSandboxFromInstance(sandbox: SandboxInstance): Promise<DaytonaSandbox> {
    if (sandbox.nativeSandbox && typeof sandbox.nativeSandbox.process?.executeCommand === 'function') {
      return sandbox.nativeSandbox as DaytonaSandbox
    }

    const { Daytona } = await this.getDaytona()
    const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })

    const sandboxId = (sandbox.metadata?.sandboxId as string) || sandbox.id
    const reconnectedSandbox = await daytona.get(sandboxId)

    return reconnectedSandbox as DaytonaSandbox
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
      await logger.info(`Executing ${agentType} agent in Daytona sandbox...`)

      const daytonaSandbox = await this.getSandboxFromInstance(sandbox)
      const workDir = (sandbox.metadata?.workDir as string) || 'workspace/project'

      const installCmd = this.getAgentInstallCommand(agentType)
      if (installCmd) {
        await logger.info(`Installing ${agentType} CLI...`)
        const installResult = await daytonaSandbox.process.executeCommand(installCmd, workDir, undefined, 300)

        if (installResult.exitCode !== 0) {
          throw new Error(`Failed to install ${agentType} CLI: ${installResult.result}`)
        }
      }

      const executeCmd = this.getAgentExecuteCommand(agentType, instruction, selectedModel)
      await logger.command(executeCmd)

      const result = await daytonaSandbox.process.executeCommand(executeCmd, workDir, undefined, 1800)

      if (result.result) {
        await logger.info(result.result)
      }

      if (result.exitCode !== 0) {
        await logger.error(`Agent execution failed with exit code ${result.exitCode}`)
        return {
          success: false,
          error: result.result || 'Agent execution failed',
        }
      }

      return {
        success: true,
        output: result.result || 'Agent execution completed',
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
      const daytonaSandbox = await this.getSandboxFromInstance(sandbox)
      const workDir = (sandbox.metadata?.workDir as string) || 'workspace/project'

      const status = await daytonaSandbox.git.status(workDir)

      if (status.fileStatus.length === 0) {
        await logger.info('No changes to commit')
        return { success: true }
      }

      await logger.info('Changes detected, committing...')

      await daytonaSandbox.git.add(workDir, ['.'])
      await logger.info('Changes staged')

      await daytonaSandbox.git.commit(workDir, commitMessage, 'AI Agent', 'agent@coding-agent-template.dev')
      await logger.info('Changes committed successfully')

      await daytonaSandbox.git.push(workDir)
      await logger.success(`Successfully pushed changes to branch: ${branchName}`)

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`Failed to push changes: ${errorMessage}`)

      if (errorMessage.includes('Permission') || errorMessage.includes('403')) {
        await logger.info('Note: Permission issue - changes committed locally but not pushed')
        return { success: true, pushFailed: true }
      }

      return { success: true, pushFailed: true }
    }
  }

  async destroy(sandbox: SandboxInstance, logger: TaskLogger): Promise<{ success: boolean; error?: string }> {
    try {
      await logger.info('Closing Daytona sandbox...')

      const daytonaSandbox = await this.getSandboxFromInstance(sandbox)

      if (daytonaSandbox && typeof daytonaSandbox.delete === 'function') {
        await daytonaSandbox.delete()
        await logger.success('Daytona sandbox closed successfully')
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logger.error(`Failed to close Daytona sandbox: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }
}
