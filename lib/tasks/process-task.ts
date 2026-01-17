/**
 * Task Processing Module
 *
 * Shared logic for processing coding tasks. Used by both the REST API
 * and MCP tool handlers to ensure consistent task execution.
 */

import { Sandbox } from '@vercel/sandbox'
import { db } from '@/lib/db/client'
import { tasks, connectors, taskMessages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { generateTaskTitle, createFallbackTitle } from '@/lib/utils/title-generator'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { decrypt } from '@/lib/crypto'
import { generateId } from '@/lib/utils/id'

export interface TaskProcessingInput {
  taskId: string
  prompt: string
  repoUrl: string
  maxDuration: number
  selectedAgent?: string
  selectedModel?: string
  installDependencies?: boolean
  keepAlive?: boolean
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  }
  githubToken?: string | null
  githubUser?: {
    username: string
    name: string | null
    email: string | null
  } | null
}

/**
 * Generate AI branch name for a task (non-blocking)
 */
export async function generateTaskBranchName(
  taskId: string,
  prompt: string,
  repoUrl?: string,
  selectedAgent?: string,
): Promise<void> {
  try {
    if (!process.env.AI_GATEWAY_API_KEY) {
      return
    }

    const logger = createTaskLogger(taskId)
    await logger.info('Generating AI-powered branch name...')

    let repoName: string | undefined
    try {
      const url = new URL(repoUrl || '')
      const pathParts = url.pathname.split('/')
      if (pathParts.length >= 3) {
        repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
      }
    } catch {
      // Ignore URL parsing errors
    }

    const aiBranchName = await generateBranchName({
      description: prompt,
      repoName,
      context: `${selectedAgent || 'claude'} agent task`,
    })

    await db
      .update(tasks)
      .set({
        branchName: aiBranchName,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))

    await logger.success('Generated AI branch name')
  } catch (error) {
    console.error('Error generating AI branch name')
    const fallbackBranchName = createFallbackBranchName(taskId)

    try {
      await db
        .update(tasks)
        .set({
          branchName: fallbackBranchName,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))

      const logger = createTaskLogger(taskId)
      await logger.info('Using fallback branch name')
    } catch (dbError) {
      console.error('Error updating task with fallback branch name')
    }
  }
}

/**
 * Generate AI title for a task (non-blocking)
 */
export async function generateTaskTitleAsync(
  taskId: string,
  prompt: string,
  repoUrl?: string,
  selectedAgent?: string,
): Promise<void> {
  try {
    if (!process.env.AI_GATEWAY_API_KEY) {
      return
    }

    let repoName: string | undefined
    try {
      const url = new URL(repoUrl || '')
      const pathParts = url.pathname.split('/')
      if (pathParts.length >= 3) {
        repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
      }
    } catch {
      // Ignore URL parsing errors
    }

    const aiTitle = await generateTaskTitle({
      prompt,
      repoName,
      context: `${selectedAgent || 'claude'} agent task`,
    })

    await db
      .update(tasks)
      .set({
        title: aiTitle,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
  } catch (error) {
    console.error('Error generating AI title')
    const fallbackTitle = createFallbackTitle(prompt)

    try {
      await db
        .update(tasks)
        .set({
          title: fallbackTitle,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
    } catch (dbError) {
      console.error('Error updating task with fallback title')
    }
  }
}

/**
 * Wait for AI-generated branch name with timeout
 */
async function waitForBranchName(taskId: string, maxWaitMs: number = 10000): Promise<string | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
      if (task?.branchName) {
        return task.branchName
      }
    } catch (error) {
      console.error('Error checking for branch name')
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return null
}

/**
 * Check if task was stopped
 */
async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return task?.status === 'stopped'
  } catch (error) {
    console.error('Error checking task status')
    return false
  }
}

/**
 * Process a task with timeout wrapper
 */
export async function processTaskWithTimeout(input: TaskProcessingInput): Promise<void> {
  const TASK_TIMEOUT_MS = input.maxDuration * 60 * 1000

  const warningTimeMs = Math.max(TASK_TIMEOUT_MS - 60 * 1000, 0)
  const warningTimeout = setTimeout(async () => {
    try {
      const warningLogger = createTaskLogger(input.taskId)
      await warningLogger.info('Task is approaching timeout, will complete soon')
    } catch (error) {
      console.error('Failed to add timeout warning')
    }
  }, warningTimeMs)

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Task execution timed out after ${input.maxDuration} minutes`))
    }, TASK_TIMEOUT_MS)
  })

  try {
    await Promise.race([processTask(input), timeoutPromise])
    clearTimeout(warningTimeout)
  } catch (error: unknown) {
    clearTimeout(warningTimeout)
    if (error instanceof Error && error.message?.includes('timed out after')) {
      console.error('Task timed out')
      const timeoutLogger = createTaskLogger(input.taskId)
      await timeoutLogger.error('Task execution timed out')
      await timeoutLogger.updateStatus('error', 'Task execution timed out. The operation took too long to complete.')
    } else {
      throw error
    }
  }
}

/**
 * Main task processing function
 */
async function processTask(input: TaskProcessingInput): Promise<void> {
  const {
    taskId,
    prompt,
    repoUrl,
    maxDuration,
    selectedAgent = 'claude',
    selectedModel,
    installDependencies = false,
    keepAlive = false,
    apiKeys,
    githubToken,
    githubUser,
  } = input

  let sandbox: Sandbox | null = null
  const logger = createTaskLogger(taskId)

  try {
    console.log('Starting task processing')

    await logger.updateStatus('processing', 'Task created, preparing to start...')
    await logger.updateProgress(10, 'Initializing task execution...')

    try {
      await db.insert(taskMessages).values({
        id: generateId(12),
        taskId,
        role: 'user',
        content: prompt,
      })
    } catch (error) {
      console.error('Failed to save user message')
    }

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }
    await logger.info('API keys configured for selected agent')

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before execution began')
      return
    }

    const aiBranchName = await waitForBranchName(taskId, 10000)

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during branch name generation')
      return
    }

    if (aiBranchName) {
      await logger.info('Using AI-generated branch name')
    } else {
      await logger.info('AI branch name not ready, will use fallback during sandbox creation')
    }

    await logger.updateProgress(15, 'Creating sandbox environment')

    const port = await detectPortFromRepo(repoUrl, githubToken)

    const sandboxResult = await createSandbox(
      {
        taskId,
        repoUrl,
        githubToken,
        gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
        gitAuthorEmail: githubUser?.username ? `${githubUser.username}@users.noreply.github.com` : 'agent@example.com',
        apiKeys,
        timeout: `${maxDuration}m`,
        ports: [port],
        runtime: 'node22',
        resources: { vcpus: 4 },
        taskPrompt: prompt,
        selectedAgent,
        selectedModel,
        installDependencies,
        keepAlive,
        preDeterminedBranchName: aiBranchName || undefined,
        onProgress: async (progress: number, message: string) => {
          await logger.updateProgress(progress, message)
        },
        onCancellationCheck: async () => {
          return await isTaskStopped(taskId)
        },
      },
      logger,
    )

    if (!sandboxResult.success) {
      if (sandboxResult.cancelled) {
        await logger.info('Task was cancelled during sandbox creation')
        return
      }
      throw new Error(sandboxResult.error || 'Failed to create sandbox')
    }

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during sandbox creation')
      if (sandboxResult.sandbox) {
        try {
          await shutdownSandbox(sandboxResult.sandbox)
        } catch (error) {
          console.error('Failed to cleanup sandbox after stop')
        }
      }
      return
    }

    const { sandbox: createdSandbox, domain, branchName } = sandboxResult
    sandbox = createdSandbox || null

    const updateData: { sandboxUrl?: string; sandboxId?: string; updatedAt: Date; branchName?: string } = {
      sandboxId: sandbox?.sandboxId || undefined,
      sandboxUrl: domain || undefined,
      updatedAt: new Date(),
    }

    if (!aiBranchName) {
      updateData.branchName = branchName
    }

    await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before agent execution')
      return
    }

    await logger.updateProgress(50, 'Installing and executing agent')

    if (!sandbox) {
      throw new Error('Sandbox is not available for agent execution')
    }

    type Connector = typeof connectors.$inferSelect
    let mcpServers: Connector[] = []

    // Note: MCP servers are user-specific - we'd need to fetch them separately for MCP flows
    // For now, task processing doesn't have access to connected MCP servers in MCP flow

    const sanitizedPrompt = prompt.replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/^-/gm, ' -')

    const agentMessageId = generateId()

    const agentResult = await executeAgentInSandbox(
      sandbox,
      sanitizedPrompt,
      selectedAgent as AgentType,
      logger,
      selectedModel,
      mcpServers,
      undefined,
      apiKeys,
      undefined,
      undefined,
      taskId,
      agentMessageId,
      githubToken ?? undefined,
    )

    if (!agentResult.success && !agentResult.error) {
      agentResult.error = 'Agent execution failed without specific error'
    }

    if (agentResult.sessionId) {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentResult.sessionId)
      if (isValidUUID) {
        await db.update(tasks).set({ agentSessionId: agentResult.sessionId }).where(eq(tasks.id, taskId))
        await logger.info('Session ID stored successfully')
      }
    }

    if (agentResult.success) {
      await logger.success('Agent execution completed')
      await logger.info('Code changes applied successfully')

      if (agentResult.agentResponse) {
        await logger.info('Agent response received')

        try {
          await db.insert(taskMessages).values({
            id: generateId(12),
            taskId,
            role: 'agent',
            content: agentResult.agentResponse,
          })
        } catch (error) {
          console.error('Failed to save agent message')
        }
      }

      let commitMessage: string
      try {
        let repoName: string | undefined
        try {
          const url = new URL(repoUrl)
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        if (process.env.AI_GATEWAY_API_KEY) {
          commitMessage = await generateCommitMessage({
            description: prompt,
            repoName,
            context: `${selectedAgent} agent task`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(prompt)
        }
      } catch (error) {
        console.error('Error generating commit message')
        commitMessage = createFallbackCommitMessage(prompt)
      }

      const pushResult = await pushChangesToBranch(sandbox!, branchName!, commitMessage, logger)

      if (keepAlive) {
        await logger.info('Sandbox kept alive for follow-up messages')
      } else {
        unregisterSandbox(taskId)
        const shutdownResult = await shutdownSandbox(sandbox!)
        if (shutdownResult.success) {
          await logger.success('Sandbox shutdown completed')
        } else {
          await logger.error('Sandbox shutdown failed')
        }
      }

      if (pushResult.pushFailed) {
        await logger.updateStatus('error')
        await logger.error('Task failed: Unable to push changes to repository')
        throw new Error('Failed to push changes to repository')
      } else {
        await logger.updateStatus('completed')
        await logger.updateProgress(100, 'Task completed successfully')
      }
    } else {
      await logger.error('Agent execution failed')
      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error processing task')

    if (sandbox) {
      try {
        if (keepAlive) {
          await logger.info('Sandbox kept alive despite error')
        } else {
          unregisterSandbox(taskId)
          const shutdownResult = await shutdownSandbox(sandbox)
          if (shutdownResult.success) {
            await logger.info('Sandbox shutdown completed after error')
          } else {
            await logger.error('Sandbox shutdown failed')
          }
        }
      } catch (shutdownError) {
        console.error('Failed to shutdown sandbox after error')
        await logger.error('Failed to shutdown sandbox after error')
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    await logger.error('Error occurred during task processing')
    await logger.updateStatus('error', errorMessage)
  }
}
