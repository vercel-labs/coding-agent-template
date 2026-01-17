/**
 * MCP Tool: Create Task
 *
 * Creates a new coding task, triggers execution, and returns the task ID.
 * Supports full task execution including GitHub access via API tokens.
 */

import { db } from '@/lib/db/client'
import { tasks, users, insertTaskSchema } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { processTaskWithTimeout, generateTaskBranchName, generateTaskTitleAsync } from '@/lib/tasks/process-task'
import { McpToolHandler } from '../types'
import { CreateTaskInput } from '../schemas'

export const createTaskHandler: McpToolHandler<CreateTaskInput> = async (input, context) => {
  try {
    // Check authentication
    const userId = context?.extra?.authInfo?.clientId
    if (!userId) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      }
    }

    // Get user info for rate limiting
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      return {
        content: [{ type: 'text', text: 'User not found' }],
        isError: true,
      }
    }

    // Check rate limit
    const rateLimit = await checkRateLimit({ id: user.id, email: user.email ?? undefined })
    if (!rateLimit.allowed) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Rate limit exceeded',
              message: 'You have reached your daily message limit',
              remaining: rateLimit.remaining,
              total: rateLimit.total,
              resetAt: rateLimit.resetAt.toISOString(),
            }),
          },
        ],
        isError: true,
      }
    }

    // Verify GitHub access before creating task (critical for MCP external access)
    const githubToken = await getUserGitHubToken(userId)
    if (!githubToken) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'GitHub not connected',
              message:
                'GitHub access is required for repository operations. Please connect your GitHub account via the web UI settings page.',
              hint: 'Sign in to the web application and connect GitHub under Settings > Accounts',
            }),
          },
        ],
        isError: true,
      }
    }

    // Get user's GitHub info and API keys using userId (works with API token auth)
    const githubUser = await getGitHubUser(userId)
    const userApiKeys = await getUserApiKeys(userId)
    const maxSandboxDuration = await getMaxSandboxDuration(userId)

    // Generate task ID
    const taskId = generateId(12)

    // Validate and insert task
    const validatedData = insertTaskSchema.parse({
      ...input,
      id: taskId,
      userId: user.id,
      status: 'pending',
      progress: 0,
      logs: [],
    })

    const [newTask] = await db
      .insert(tasks)
      .values({
        ...validatedData,
        id: taskId,
      })
      .returning()

    // Trigger background tasks (non-blocking)
    // Generate AI branch name and title in parallel
    Promise.all([
      generateTaskBranchName(
        taskId,
        validatedData.prompt,
        validatedData.repoUrl ?? undefined,
        validatedData.selectedAgent ?? undefined,
      ),
      generateTaskTitleAsync(
        taskId,
        validatedData.prompt,
        validatedData.repoUrl ?? undefined,
        validatedData.selectedAgent ?? undefined,
      ),
    ]).catch(() => {
      console.error('Error in background generation tasks')
    })

    // Trigger task execution (non-blocking)
    // Use setImmediate to allow response to be sent first
    setImmediate(async () => {
      try {
        await processTaskWithTimeout({
          taskId,
          prompt: validatedData.prompt,
          repoUrl: validatedData.repoUrl || '',
          maxDuration: validatedData.maxDuration || maxSandboxDuration,
          selectedAgent: validatedData.selectedAgent || 'claude',
          selectedModel: validatedData.selectedModel ?? undefined,
          installDependencies: validatedData.installDependencies || false,
          keepAlive: validatedData.keepAlive || false,
          apiKeys: userApiKeys,
          githubToken,
          githubUser,
        })
      } catch (error) {
        console.error('Task processing failed')
      }
    })

    // Return success response with task ID immediately
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            taskId: newTask.id,
            status: 'processing',
            message: 'Task created and execution started. Use get-task to check progress.',
            createdAt: newTask.createdAt,
          }),
        },
      ],
    }
  } catch (error) {
    console.error('Error creating task')
    return {
      content: [{ type: 'text', text: 'Failed to create task' }],
      isError: true,
    }
  }
}
