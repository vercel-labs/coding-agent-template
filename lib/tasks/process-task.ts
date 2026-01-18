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

/**
 * Validate GitHub repository URL format
 * Ensures URL is a valid GitHub repository before passing to git clone
 */
function validateGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Must be github.com or www.github.com
    if (!['github.com', 'www.github.com'].includes(parsed.hostname || '')) {
      return false
    }

    // Path must match /owner/repo or /owner/repo.git format
    // Allow alphanumeric, hyphens, underscores, and dots in owner/repo names
    if (!/^\/[\w.-]+\/[\w.-]+(\.git)?$/.test(parsed.pathname)) {
      return false
    }

    return true
  } catch {
    // Invalid URL format
    return false
  }
}

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
  userId?: string
  mcpServers?: (typeof connectors.$inferSelect)[]
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
 * Wait for AI-generated branch name with exponential backoff
 *
 * Polls the database with increasing intervals to check if the branch name
 * has been generated. Uses exponential backoff to reduce database load.
 *
 * @param taskId - The task ID to check
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 10000)
 * @returns The branch name if generated within timeout, null otherwise
 */
async function waitForBranchName(taskId: string, maxWaitMs: number = 10000): Promise<string | null> {
  const startTime = Date.now()
  let waitMs = 1000 // Start with 1 second

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
      if (task?.branchName) {
        return task.branchName
      }
    } catch (error) {
      console.error('Error checking for branch name')
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs))
    waitMs = Math.min(waitMs * 1.5, 3000) // Exponential backoff, max 3s
  }

  return null
}

/**
 * Check if task was stopped
 */
export async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return task?.status === 'stopped'
  } catch (error) {
    console.error('Error checking task status')
    return false
  }
}

/**
 * Check if task has active sub-agents and recent heartbeat activity
 * Only selects necessary fields to minimize database query payload
 */
async function checkTaskActivity(
  taskId: string,
): Promise<{ hasActiveSubAgents: boolean; lastHeartbeat: Date | null; currentSubAgent: string | null }> {
  try {
    // Select only the fields needed for timeout checking (avoids fetching large logs array)
    const [task] = await db
      .select({
        subAgentActivity: tasks.subAgentActivity,
        lastHeartbeat: tasks.lastHeartbeat,
        currentSubAgent: tasks.currentSubAgent,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)

    if (!task) {
      return { hasActiveSubAgents: false, lastHeartbeat: null, currentSubAgent: null }
    }

    // Consider "starting" sub-agents as active only if recently started (< 5 min)
    // This prevents infinite timeout extension from stuck "starting" states
    const STARTING_TIMEOUT_MS = 5 * 60 * 1000
    const activeSubAgents = (task.subAgentActivity || []).filter((sa) => {
      if (sa.status === 'running') return true
      if (sa.status === 'starting') {
        const startAge = Date.now() - new Date(sa.startedAt).getTime()
        return startAge < STARTING_TIMEOUT_MS
      }
      return false
    })

    return {
      hasActiveSubAgents: activeSubAgents.length > 0,
      lastHeartbeat: task.lastHeartbeat,
      currentSubAgent: task.currentSubAgent,
    }
  } catch {
    return { hasActiveSubAgents: false, lastHeartbeat: null, currentSubAgent: null }
  }
}

/**
 * Process a task with timeout wrapper that respects heartbeat activity
 * The timeout will be extended if there's recent heartbeat activity (sub-agents running)
 */
export async function processTaskWithTimeout(input: TaskProcessingInput): Promise<void> {
  const TASK_TIMEOUT_MS = input.maxDuration * 60 * 1000
  const HEARTBEAT_GRACE_PERIOD_MS = 5 * 60 * 1000 // 5 minute grace period for active sub-agents
  const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1000 // Check every 30 seconds

  let isTimedOut = false
  let warningLogged = false

  // Create a timeout controller
  const timeoutController = {
    shouldStop: false,
    interval: null as NodeJS.Timeout | null,
  }

  const taskStartTime = Date.now()

  // Start heartbeat-aware timeout monitoring
  const monitorPromise = new Promise<never>((_, reject) => {
    timeoutController.interval = setInterval(async () => {
      const elapsedMs = Date.now() - taskStartTime

      // Check for early timeout (no sub-agents)
      if (elapsedMs >= TASK_TIMEOUT_MS) {
        const { hasActiveSubAgents, lastHeartbeat } = await checkTaskActivity(input.taskId)

        // If there's recent heartbeat activity and active sub-agents, grant grace period
        if (hasActiveSubAgents && lastHeartbeat) {
          const heartbeatAge = Date.now() - new Date(lastHeartbeat).getTime()
          if (heartbeatAge < HEARTBEAT_GRACE_PERIOD_MS) {
            // Still within grace period, continue
            if (!warningLogged) {
              const warningLogger = createTaskLogger(input.taskId)
              await warningLogger.info(`Sub-agent is active - extending timeout grace period`)
              warningLogged = true
            }
            return
          }
        }

        // Check absolute maximum (max duration + grace period)
        if (elapsedMs >= TASK_TIMEOUT_MS + HEARTBEAT_GRACE_PERIOD_MS) {
          // Check if task already completed before timing out (race condition prevention)
          const [currentTask] = await db
            .select({ status: tasks.status })
            .from(tasks)
            .where(eq(tasks.id, input.taskId))
            .limit(1)
          if (
            currentTask?.status === 'completed' ||
            currentTask?.status === 'error' ||
            currentTask?.status === 'stopped'
          ) {
            return // Task already finished, don't timeout
          }
          isTimedOut = true
          reject(new Error('Task execution timed out'))
          return
        }

        // Original timeout reached without recent activity
        if (!hasActiveSubAgents || !lastHeartbeat) {
          // Check if task already completed before timing out (race condition prevention)
          const [currentTask] = await db
            .select({ status: tasks.status })
            .from(tasks)
            .where(eq(tasks.id, input.taskId))
            .limit(1)
          if (
            currentTask?.status === 'completed' ||
            currentTask?.status === 'error' ||
            currentTask?.status === 'stopped'
          ) {
            return // Task already finished, don't timeout
          }
          isTimedOut = true
          reject(new Error('Task execution timed out'))
          return
        }
      }

      // Log warning 1 minute before timeout
      if (!warningLogged && elapsedMs >= TASK_TIMEOUT_MS - 60 * 1000) {
        const { currentSubAgent } = await checkTaskActivity(input.taskId)
        const warningLogger = createTaskLogger(input.taskId)
        if (currentSubAgent) {
          await warningLogger.info(`Task approaching timeout. Sub-agent running, timeout may be extended.`)
        } else {
          await warningLogger.info('Task is approaching timeout, will complete soon')
        }
        warningLogged = true
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS)
  })

  try {
    await Promise.race([processTask(input), monitorPromise])
    if (timeoutController.interval) {
      clearInterval(timeoutController.interval)
    }
  } catch (error: unknown) {
    if (timeoutController.interval) {
      clearInterval(timeoutController.interval)
    }
    if (error instanceof Error && error.message?.includes('timed out after')) {
      console.error('Task timed out')
      const timeoutLogger = createTaskLogger(input.taskId)
      await timeoutLogger.error('Task execution timed out')

      // CRITICAL: Mark task as error in database FIRST
      // This will cause any running agent loops to exit on next cancellation check
      try {
        await db
          .update(tasks)
          .set({
            status: 'error',
            error: 'Task execution timed out',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId))
      } catch (dbError) {
        console.error('Failed to update task status after timeout')
      }

      await timeoutLogger.updateStatus('error', 'Task execution timed out. The operation took too long to complete.')

      // Clean up sandbox on timeout - use the DB-backed stop function
      try {
        // Import the DB-backed sandbox stop function
        const { stopSandboxFromDB } = await import('@/lib/sandbox/sandbox-registry')
        const stopResult = await stopSandboxFromDB(input.taskId)

        if (stopResult.success) {
          await timeoutLogger.info('Sandbox terminated after timeout')
        } else {
          // Fallback to direct cleanup if stopSandboxFromDB failed
          const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)
          if (task?.sandboxId && !input.keepAlive) {
            const { Sandbox } = await import('@vercel/sandbox')
            try {
              const sandbox = await Sandbox.get({
                sandboxId: task.sandboxId,
                teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
                projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
                token: process.env.SANDBOX_VERCEL_TOKEN!,
              })
              await shutdownSandbox(sandbox)
            } catch (sandboxError) {
              // Sandbox may already be gone - that's OK
            }
          }
          unregisterSandbox(input.taskId)
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup sandbox after timeout')
      }
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

    // Re-validate GitHub token if repo access is needed
    if (repoUrl && !githubToken) {
      await logger.error('GitHub access no longer available')
      await db
        .update(tasks)
        .set({
          status: 'error',
          error: 'GitHub token was revoked or expired. Please reconnect GitHub.',
        })
        .where(eq(tasks.id, taskId))
      return
    }

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

    // Validate repository URL format
    if (repoUrl && !validateGitHubUrl(repoUrl)) {
      await logger.error('Invalid repository URL format')
      await db
        .update(tasks)
        .set({
          status: 'error',
          error: 'Invalid GitHub repository URL format. Please provide a valid GitHub repository URL.',
        })
        .where(eq(tasks.id, taskId))
      return
    }

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
    let mcpServers: Connector[] = input.mcpServers || []

    // If no pre-fetched servers but we have userId, fetch them
    if (mcpServers.length === 0 && input.userId) {
      try {
        const userConnectors = await db
          .select()
          .from(connectors)
          .where(and(eq(connectors.userId, input.userId), eq(connectors.status, 'connected')))

        mcpServers = userConnectors.map((connector: Connector) => ({
          ...connector,
          env: connector.env ? JSON.parse(decrypt(connector.env)) : null,
          oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
        }))

        if (mcpServers.length > 0) {
          await logger.info('Found connected MCP servers')
        }
      } catch {
        await logger.info('Warning: Could not fetch MCP servers, continuing without them')
      }
    }

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
