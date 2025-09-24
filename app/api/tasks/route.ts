import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { eq, desc, and, or } from 'drizzle-orm'
import { createInfoLog, createCommandLog, createErrorLog, createSuccessLog } from '@/lib/utils/logging'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'

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
      logs: [createInfoLog('Task created, preparing to start...')],
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
    processTaskWithTimeout(
      newTask.id,
      validatedData.prompt,
      validatedData.repoUrl || '',
      validatedData.selectedAgent || 'claude',
      validatedData.selectedModel,
    )

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
    await Promise.race([processTask(taskId, prompt, repoUrl, selectedAgent, selectedModel), timeoutPromise])

    // Clear the warning timeout if task completes successfully
    clearTimeout(warningTimeout)
  } catch (error: any) {
    // Clear the warning timeout on any error
    clearTimeout(warningTimeout)
    // Handle timeout specifically
    if (error.message?.includes('timed out after 5 minutes')) {
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

async function processTask(
  taskId: string,
  prompt: string,
  repoUrl: string,
  selectedAgent: string = 'claude',
  selectedModel?: string,
) {
  let sandbox: any = null
  const logger = createTaskLogger(taskId)

  try {
    // Update task status to processing with real-time logging
    await logger.updateStatus('processing', 'Task created, preparing to start...')
    await logger.updateProgress(10, 'Initializing task execution...')

    // Wait for AI-generated branch name (with timeout)
    await logger.updateProgress(12, 'Waiting for AI-generated branch name...')
    const aiBranchName = await waitForBranchName(taskId, 10000)

    if (aiBranchName) {
      await logger.info(`Using AI-generated branch name: ${aiBranchName}`)
    } else {
      await logger.info('AI branch name not ready, will use fallback during sandbox creation')
    }

    await logger.updateProgress(15, 'Creating sandbox environment...')

    // Create sandbox with progress callback and 5-minute timeout
    const sandboxResult = await createSandbox({
      repoUrl,
      timeout: '5m',
      ports: [3000],
      runtime: 'node22',
      resources: { vcpus: 4 },
      taskPrompt: prompt,
      selectedAgent,
      selectedModel,
      preDeterminedBranchName: aiBranchName || undefined,
      onProgress: async (progress: number, message: string) => {
        // Use real-time logger for progress updates
        await logger.updateProgress(progress, message)
      },
    })

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error || 'Failed to create sandbox')
    }

    const { sandbox: createdSandbox, domain, branchName } = sandboxResult
    sandbox = createdSandbox

    // Log sandbox creation completion and append sandbox logs
    await logger.success('Sandbox created successfully')

    // Append sandbox logs to database in real-time
    for (const log of sandboxResult.logs || []) {
      if (log.startsWith('$ ')) {
        await logger.command(log.substring(2)) // Remove "$ " prefix
      } else if (log.startsWith('Error: ')) {
        await logger.error(log)
      } else {
        await logger.info(log)
      }
    }

    // Update sandbox URL and branch name (only update branch name if not already set by AI)
    const updateData: any = {
      sandboxUrl: domain,
      updatedAt: new Date(),
    }

    // Only update branch name if we don't already have an AI-generated one
    if (!aiBranchName) {
      updateData.branchName = branchName
    }

    await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))

    // Log agent execution start
    await logger.updateProgress(50, `Installing and executing ${selectedAgent} agent...`)

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

    const agentResult = await Promise.race([
      executeAgentInSandbox(sandbox, prompt, selectedAgent as AgentType, logger, selectedModel),
      agentTimeoutPromise,
    ])

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
      const pushResult = await pushChangesToBranch(sandbox, branchName!, commitMessage)

      // Append push result logs in real-time
      for (const log of pushResult.logs || []) {
        if (log.startsWith('$ ')) {
          await logger.command(log.substring(2)) // Remove "$ " prefix
        } else if (log.startsWith('Error: ')) {
          await logger.error(log)
        } else {
          await logger.info(log)
        }
      }

      // Shutdown sandbox
      const shutdownResult = await shutdownSandbox(sandbox)
      if (shutdownResult.success) {
        await logger.success('Sandbox shutdown completed')
      } else {
        await logger.error(`Sandbox shutdown failed: ${shutdownResult.error}`)
      }

      // Update task as completed
      await logger.updateStatus('completed')
      await logger.updateProgress(100, 'Task completed successfully')
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
    const validActions = ['completed', 'failed']
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
