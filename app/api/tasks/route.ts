import { NextRequest, NextResponse, after } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema, connectors } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { eq, desc, or, and } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'

export async function GET() {
  try {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt))
    return NextResponse.json({ tasks: allTasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Use provided ID or generate a new one
    const taskId = body.id || generateId(12)
    const validatedData = insertTaskSchema.parse({
      ...body,
      id: taskId,
      status: 'pending',
      progress: 0,
      logs: [],
    })

    // Insert the task into the database - ensure id is definitely present
    const [newTask] = await db
      .insert(tasks)
      .values({
        ...validatedData,
        id: taskId, // Ensure id is always present
      })
      .returning()

    // Generate AI branch name after response is sent (non-blocking)
    after(async () => {
      try {
        // Check if AI Gateway API key is available
        if (!process.env.AI_GATEWAY_API_KEY) {
          console.log('AI_GATEWAY_API_KEY not available, skipping AI branch name generation')
          return
        }

        const logger = createTaskLogger(taskId)
        await logger.info('Generating AI-powered branch name...')

        // Extract repository name from URL for context
        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace('.git', '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        // Generate AI branch name
        const aiBranchName = await generateBranchName({
          description: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        // Update task with AI-generated branch name
        await db
          .update(tasks)
          .set({
            branchName: aiBranchName,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))

        await logger.success(`Generated AI branch name: ${aiBranchName}`)
      } catch (error) {
        console.error('Error generating AI branch name:', error)

        // Fallback to timestamp-based branch name
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
          await logger.info(`Using fallback branch name: ${fallbackBranchName}`)
        } catch (dbError) {
          console.error('Error updating task with fallback branch name:', dbError)
        }
      }
    })

    // Process the task asynchronously with timeout
    // CRITICAL: Wrap in after() to ensure Vercel doesn't kill the function after response
    // Without this, serverless functions terminate immediately after sending the response
    after(async () => {
      try {
        await processTaskWithTimeout(
          newTask.id,
          validatedData.prompt,
          validatedData.repoUrl || '',
          validatedData.selectedAgent || 'claude',
          validatedData.selectedModel,
          validatedData.installDependencies || false,
          validatedData.maxDuration || 5,
        )
      } catch (error) {
        console.error('Task processing failed:', error)
        // Error handling is already done inside processTaskWithTimeout
      }
    })

    return NextResponse.json({ task: newTask })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

async function processTaskWithTimeout(
  taskId: string,
  prompt: string,
  repoUrl: string,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  maxDuration: number = 5,
) {
  const TASK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes in milliseconds

  // Add a warning at 4 minutes
  const warningTimeout = setTimeout(
    async () => {
      try {
        const warningLogger = createTaskLogger(taskId)
        await warningLogger.info('Task is taking longer than expected (4+ minutes). Will timeout in 1 minute.')
      } catch (error) {
        console.error('Failed to add timeout warning:', error)
      }
    },
    4 * 60 * 1000,
  ) // 4 minutes

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Task execution timed out after 5 minutes'))
    }, TASK_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      processTask(taskId, prompt, repoUrl, selectedAgent, selectedModel, installDependencies, maxDuration),
      timeoutPromise,
    ])

    // Clear the warning timeout if task completes successfully
    clearTimeout(warningTimeout)
  } catch (error: unknown) {
    // Clear the warning timeout on any error
    clearTimeout(warningTimeout)
    // Handle timeout specifically
    if (error instanceof Error && error.message?.includes('timed out after 5 minutes')) {
      console.error('Task timed out:', taskId)

      // Use logger for timeout error
      const timeoutLogger = createTaskLogger(taskId)
      await timeoutLogger.error('Task execution timed out after 5 minutes')
      await timeoutLogger.updateStatus(
        'error',
        'Task execution timed out after 5 minutes. The operation took too long to complete.',
      )
    } else {
      // Re-throw other errors to be handled by the original error handler
      throw error
    }
  }
}

// Helper function to wait for AI-generated branch name
async function waitForBranchName(taskId: string, maxWaitMs: number = 10000): Promise<string | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
      if (task?.branchName) {
        return task.branchName
      }
    } catch (error) {
      console.error('Error checking for branch name:', error)
    }

    // Wait 500ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return null
}

// Helper function to check if task was stopped
async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return task?.status === 'stopped'
  } catch (error) {
    console.error('Error checking task status:', error)
    return false
  }
}

async function processTask(
  taskId: string,
  prompt: string,
  repoUrl: string,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  maxDuration: number = 5,
) {
  let sandbox: Sandbox | null = null
  const logger = createTaskLogger(taskId)
  const taskStartTime = Date.now()

  try {
    console.log(`[TASK ${taskId}] Starting task processing at ${new Date().toISOString()}`)

    // Update task status to processing with real-time logging
    await logger.updateStatus('processing', 'Task created, preparing to start...')
    await logger.updateProgress(10, 'Initializing task execution...')

    // Get user's GitHub token for repository access
    const githubToken = await getUserGitHubToken()
    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }

    // Check if task was stopped before we even start
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before execution began')
      return
    }

    // Wait for AI-generated branch name (with timeout)
    const aiBranchName = await waitForBranchName(taskId, 10000)

    // Check if task was stopped during branch name generation
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during branch name generation')
      return
    }

    if (aiBranchName) {
      await logger.info(`Using AI-generated branch name: ${aiBranchName}`)
    } else {
      await logger.info('AI branch name not ready, will use fallback during sandbox creation')
    }

    await logger.updateProgress(15, 'Creating sandbox environment...')
    console.log(`[TASK ${taskId}] Creating sandbox at ${new Date().toISOString()}`)

    // Create sandbox with progress callback and 5-minute timeout
    const sandboxResult = await createSandbox(
      {
        taskId,
        repoUrl,
        githubToken,
        timeout: `${maxDuration}m`,
        ports: [3000],
        runtime: 'node22',
        resources: { vcpus: 4 },
        taskPrompt: prompt,
        selectedAgent,
        selectedModel,
        installDependencies,
        preDeterminedBranchName: aiBranchName || undefined,
        onProgress: async (progress: number, message: string) => {
          // Use real-time logger for progress updates
          await logger.updateProgress(progress, message)
        },
        onCancellationCheck: async () => {
          // Check if task was stopped
          return await isTaskStopped(taskId)
        },
      },
      logger,
    )

    if (!sandboxResult.success) {
      if (sandboxResult.cancelled) {
        // Task was cancelled, this should result in stopped status, not error
        await logger.info('Task was cancelled during sandbox creation')
        return
      }
      throw new Error(sandboxResult.error || 'Failed to create sandbox')
    }

    // Check if task was stopped during sandbox creation
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during sandbox creation')
      // Clean up sandbox if it was created
      if (sandboxResult.sandbox) {
        try {
          await shutdownSandbox(sandboxResult.sandbox)
        } catch (error) {
          console.error('Failed to cleanup sandbox after stop:', error)
        }
      }
      return
    }

    const { sandbox: createdSandbox, domain, branchName } = sandboxResult
    sandbox = createdSandbox || null
    console.log(`[TASK ${taskId}] Sandbox created successfully at ${new Date().toISOString()}`)

    // Update sandbox URL and branch name (only update branch name if not already set by AI)
    const updateData: { sandboxUrl?: string; updatedAt: Date; branchName?: string } = {
      sandboxUrl: domain || undefined,
      updatedAt: new Date(),
    }

    // Only update branch name if we don't already have an AI-generated one
    if (!aiBranchName) {
      updateData.branchName = branchName
    }

    await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))

    // Check if task was stopped before agent execution
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before agent execution')
      return
    }

    // Log agent execution start
    await logger.updateProgress(50, `Installing and executing ${selectedAgent} agent...`)
    console.log(`[TASK ${taskId}] Starting ${selectedAgent} agent execution at ${new Date().toISOString()}`)

    // Execute selected agent with timeout (different timeouts per agent)
    const getAgentTimeout = (agent: string) => {
      switch (agent) {
        case 'cursor':
          return 5 * 60 * 1000 // 5 minutes for cursor (needs more time)
        case 'claude':
        case 'codex':
        case 'opencode':
        default:
          return 3 * 60 * 1000 // 3 minutes for other agents
      }
    }

    const AGENT_TIMEOUT_MS = getAgentTimeout(selectedAgent)
    const timeoutMinutes = Math.floor(AGENT_TIMEOUT_MS / (60 * 1000))

    const agentTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${selectedAgent} agent execution timed out after ${timeoutMinutes} minutes`))
      }, AGENT_TIMEOUT_MS)
    })

    if (!sandbox) {
      throw new Error('Sandbox is not available for agent execution')
    }

    type Connector = typeof connectors.$inferSelect

    let mcpServers: Connector[] = []

    try {
      // Get current user session to filter connectors
      const session = await getServerSession()

      if (session?.user?.id) {
        const userConnectors = await db
          .select()
          .from(connectors)
          .where(and(eq(connectors.userId, session.user.id), eq(connectors.status, 'connected')))

        mcpServers = userConnectors.map((connector: Connector) => {
          return {
            ...connector,
            oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
          }
        })

        if (mcpServers.length > 0) {
          await logger.info(
            `Found ${mcpServers.length} connected MCP servers: ${mcpServers.map((s) => s.name).join(', ')}`,
          )

          // Store MCP server IDs in the task
          await db
            .update(tasks)
            .set({
              mcpServerIds: JSON.parse(JSON.stringify(mcpServers.map((s) => s.id))),
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        } else {
          await logger.info('No connected MCP servers found for current user')
        }
      } else {
        await logger.info('No user session found, continuing without MCP servers')
      }
    } catch (mcpError) {
      console.error('Failed to fetch MCP servers:', mcpError)
      await logger.info('Warning: Could not fetch MCP servers, continuing without them')
    }

    const agentResult = await Promise.race([
      executeAgentInSandbox(sandbox, prompt, selectedAgent as AgentType, logger, selectedModel, mcpServers),
      agentTimeoutPromise,
    ])

    console.log(`[TASK ${taskId}] Agent execution completed at ${new Date().toISOString()}`)

    if (agentResult.success) {
      // Log agent completion
      await logger.success(`${selectedAgent} agent execution completed`)
      await logger.info(agentResult.output || 'Code changes applied successfully')

      if (agentResult.agentResponse) {
        await logger.info(`Agent Response: ${agentResult.agentResponse}`)
      }

      // Agent execution logs are already logged in real-time by the agent
      // No need to log them again here

      // Push changes to branch
      const commitMessage = `${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`
      const pushResult = await pushChangesToBranch(sandbox!, branchName!, commitMessage, logger)

      // Unregister and shutdown sandbox
      unregisterSandbox(taskId)
      const shutdownResult = await shutdownSandbox(sandbox!)
      if (shutdownResult.success) {
        await logger.success('Sandbox shutdown completed')
      } else {
        await logger.error(`Sandbox shutdown failed: ${shutdownResult.error}`)
      }

      // Check if push failed and handle accordingly
      if (pushResult.pushFailed) {
        await logger.updateStatus('error')
        await logger.error('Task failed: Unable to push changes to repository')
        throw new Error('Failed to push changes to repository')
      } else {
        // Update task as completed
        await logger.updateStatus('completed')
        await logger.updateProgress(100, 'Task completed successfully')

        const totalTaskTime = ((Date.now() - taskStartTime) / 1000).toFixed(2)
        console.log(
          `[TASK ${taskId}] Task completed successfully at ${new Date().toISOString()} (total time: ${totalTaskTime}s)`,
        )
      }
    } else {
      // Agent failed, but we still want to capture its logs
      await logger.error(`${selectedAgent} agent execution failed`)

      // Agent execution logs are already logged in real-time by the agent
      // No need to log them again here

      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error processing task:', error)

    // Try to shutdown sandbox even on error
    if (sandbox) {
      try {
        unregisterSandbox(taskId)
        const shutdownResult = await shutdownSandbox(sandbox)
        if (shutdownResult.success) {
          await logger.info('Sandbox shutdown completed after error')
        } else {
          await logger.error(`Sandbox shutdown failed: ${shutdownResult.error}`)
        }
      } catch (shutdownError) {
        console.error('Failed to shutdown sandbox after error:', shutdownError)
        await logger.error('Failed to shutdown sandbox after error')
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    // Log the error and update task status
    await logger.error(`Error: ${errorMessage}`)
    await logger.updateStatus('error', errorMessage)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required' }, { status: 400 })
    }

    const actions = action.split(',').map((a) => a.trim())
    const validActions = ['completed', 'failed', 'stopped']
    const invalidActions = actions.filter((a) => !validActions.includes(a))

    if (invalidActions.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid action(s): ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}`,
        },
        { status: 400 },
      )
    }

    // Build the where conditions
    const conditions = []
    if (actions.includes('completed')) {
      conditions.push(eq(tasks.status, 'completed'))
    }
    if (actions.includes('failed')) {
      conditions.push(eq(tasks.status, 'error'))
    }
    if (actions.includes('stopped')) {
      conditions.push(eq(tasks.status, 'stopped'))
    }

    if (conditions.length === 0) {
      return NextResponse.json({ error: 'No valid actions specified' }, { status: 400 })
    }

    // Delete tasks based on conditions
    const whereClause = conditions.length === 1 ? conditions[0] : or(...conditions)
    const deletedTasks = await db.delete(tasks).where(whereClause).returning()

    // Build response message
    const actionMessages = []
    if (actions.includes('completed')) {
      const completedCount = deletedTasks.filter((task) => task.status === 'completed').length
      if (completedCount > 0) actionMessages.push(`${completedCount} completed`)
    }
    if (actions.includes('failed')) {
      const failedCount = deletedTasks.filter((task) => task.status === 'error').length
      if (failedCount > 0) actionMessages.push(`${failedCount} failed`)
    }
    if (actions.includes('stopped')) {
      const stoppedCount = deletedTasks.filter((task) => task.status === 'stopped').length
      if (stoppedCount > 0) actionMessages.push(`${stoppedCount} stopped`)
    }

    const message =
      actionMessages.length > 0
        ? `${actionMessages.join(' and ')} task(s) deleted successfully`
        : 'No tasks found to delete'

    return NextResponse.json({
      message,
      deletedCount: deletedTasks.length,
    })
  } catch (error) {
    console.error('Error deleting tasks:', error)
    return NextResponse.json({ error: 'Failed to delete tasks' }, { status: 500 })
  }
}
