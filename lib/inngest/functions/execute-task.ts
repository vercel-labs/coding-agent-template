import { inngest } from '../client'
import { db } from '@/lib/db/client'
import { tasks, connectors } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { getSandboxProvider } from '@/lib/sandbox/providers'
import { AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch } from '@/lib/sandbox/git'
import { decrypt } from '@/lib/crypto'
import type { SandboxType } from '@/lib/sandbox/providers/types'

async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return task?.status === 'stopped'
  } catch (error) {
    console.error('Error checking task status:', error)
    return false
  }
}

export const executeTask = inngest.createFunction(
  {
    id: 'execute-task',
    retries: 0,
  },
  { event: 'task/execute' },
  async ({ event, step }) => {
    const {
      taskId,
      prompt,
      repoUrl,
      selectedAgent = 'claude',
      selectedModel,
      installDependencies = false,
      maxDuration = 5,
      sandboxType = 'vercel',
      aiBranchName,
    } = event.data

    const logger = createTaskLogger(taskId)

    try {
      await logger.updateStatus('processing', 'Task created, preparing to start...')
      await logger.updateProgress(10, 'Initializing task execution...')

      if (await isTaskStopped(taskId)) {
        await logger.info('Task was stopped before execution began')
        return { success: false, cancelled: true }
      }

      const branchName = aiBranchName

      if (branchName) {
        await logger.info(`Using AI-generated branch name: ${branchName}`)
      } else {
        await logger.info('AI branch name not ready, will use fallback during sandbox creation')
      }

      await logger.updateProgress(15, 'Creating sandbox environment...')

      const provider = getSandboxProvider(sandboxType as SandboxType)

      const sandboxResult = await step.run('create-sandbox', async () => {
        return provider.create(
          {
            taskId,
            repoUrl,
            timeout: `${maxDuration}m`,
            ports: [3000],
            runtime: 'node22',
            resources: { vcpus: 4 },
            taskPrompt: prompt,
            selectedAgent,
            selectedModel,
            installDependencies,
            preDeterminedBranchName: branchName || undefined,
            onProgress: async (progress: number, message: string) => {
              await logger.updateProgress(progress, message)
            },
            onCancellationCheck: async () => {
              return await isTaskStopped(taskId)
            },
          },
          logger,
        )
      })

      if (!sandboxResult.success) {
        if (sandboxResult.cancelled) {
          await logger.info('Task was cancelled during sandbox creation')
          return { success: false, cancelled: true }
        }
        throw new Error(sandboxResult.error || 'Failed to create sandbox')
      }

      if (await isTaskStopped(taskId)) {
        await logger.info('Task was stopped during sandbox creation')
        if (sandboxResult.sandbox) {
          try {
            await provider.destroy(sandboxResult.sandbox, logger)
          } catch (error) {
            console.error('Failed to cleanup sandbox after stop:', error)
          }
        }
        return { success: false, cancelled: true }
      }

      const { sandbox: createdSandbox, domain, branchName: finalBranchName } = sandboxResult

      const updateData: { sandboxUrl?: string; updatedAt: Date; branchName?: string } = {
        sandboxUrl: domain || undefined,
        updatedAt: new Date(),
      }

      if (!branchName) {
        updateData.branchName = finalBranchName
      }

      await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))

      if (await isTaskStopped(taskId)) {
        await logger.info('Task was stopped before agent execution')
        return { success: false, cancelled: true }
      }

      await logger.updateProgress(50, `Installing and executing ${selectedAgent} agent...`)

      type Connector = typeof connectors.$inferSelect

      let mcpServers: Connector[] = []

      try {
        const allConnectors = await db.select().from(connectors)
        mcpServers = allConnectors
          .filter((connector: Connector) => connector.status === 'connected')
          .map((connector: Connector) => {
            return {
              ...connector,
              oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
            }
          })

        if (mcpServers.length > 0) {
          await logger.info(
            `Found ${mcpServers.length} connected MCP servers: ${mcpServers.map((s) => s.name).join(', ')}`,
          )

          await db
            .update(tasks)
            .set({
              mcpServerIds: JSON.parse(JSON.stringify(mcpServers.map((s) => s.id))),
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        }
      } catch (mcpError) {
        console.error('Failed to fetch MCP servers:', mcpError)
        await logger.info('Warning: Could not fetch MCP servers, continuing without them')
      }

      const agentResult = await step.run('execute-agent', async () => {
        if (!createdSandbox) {
          throw new Error('Sandbox is not available for agent execution')
        }

        return provider.executeAgent(
          createdSandbox,
          prompt,
          selectedAgent as AgentType,
          logger,
          selectedModel,
          mcpServers,
          async () => await isTaskStopped(taskId),
        )
      })

      if (agentResult.success) {
        await logger.success(`${selectedAgent} agent execution completed`)
        await logger.info(agentResult.output || 'Code changes applied successfully')

        if (agentResult.agentResponse) {
          await logger.info(`Agent Response: ${agentResult.agentResponse}`)
        }

        if (createdSandbox) {
          const commitMessage = `${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`

          const pushResult = await step.run('push-changes', async () => {
            // Use provider's pushChanges method if available, otherwise fall back to Vercel-specific method
            if (provider.pushChanges) {
              return await provider.pushChanges(createdSandbox, finalBranchName!, commitMessage, logger)
            } else if (createdSandbox.nativeSandbox) {
              return pushChangesToBranch(createdSandbox.nativeSandbox, finalBranchName!, commitMessage, logger)
            }
            return { success: true, pushFailed: true }
          })

          if (pushResult.pushFailed) {
            await logger.info('Changes committed locally but could not be pushed to remote')
          }

          await step.run('cleanup-sandbox', async () => {
            if (createdSandbox) {
              const shutdownResult = await provider.destroy(createdSandbox, logger)
              if (shutdownResult.success) {
                await logger.success('Sandbox shutdown completed')
              } else {
                await logger.error(`Sandbox shutdown failed: ${shutdownResult.error}`)
              }
            }
          })

          await logger.updateStatus('completed')
          await logger.updateProgress(100, 'Task completed successfully')
        }
      } else {
        await logger.error(`${selectedAgent} agent execution failed`)
        throw new Error(agentResult.error || 'Agent execution failed')
      }

      return { success: true, branchName: finalBranchName }
    } catch (error) {
      console.error('Error processing task:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      await logger.error(`Error: ${errorMessage}`)
      await logger.updateStatus('error', errorMessage)

      throw error
    }
  },
)
