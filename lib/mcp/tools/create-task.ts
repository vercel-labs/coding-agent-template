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
import { McpToolHandler } from '../types'
import { CreateTaskInput } from '../schemas'

export const createTaskHandler: McpToolHandler<CreateTaskInput> = async (input, context) => {
  try {
    // Check authentication
    const userId = context?.extra?.authInfo?.clientId
    if (!userId) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Authentication required',
              message: 'API token authentication failed.',
              hint: 'Generate an API token in the web UI at /settings and include it in your MCP client configuration.',
            }),
          },
        ],
        isError: true,
      }
    }

    // Get user info for rate limiting
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'User not found',
              message: 'The authenticated user account could not be found.',
              hint: 'Your API token may be invalid. Generate a new token in the web UI at /settings.',
            }),
          },
        ],
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
              message: `You have reached your daily limit of ${rateLimit.total} tasks.`,
              hint: 'Wait until tomorrow or contact support for increased limits.',
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
              message: 'GitHub access is required for repository operations.',
              hint: 'Visit /settings in the web UI to connect your GitHub account.',
            }),
          },
        ],
        isError: true,
      }
    }

    // Get Bearer token from context for internal API call
    const bearerToken = context?.extra?.authInfo?.token
    if (!bearerToken) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Authentication token not available',
              message: 'Bearer token is required to trigger task execution.',
              hint: 'This is an internal error. Ensure your MCP client is configured correctly with a valid API token.',
            }),
          },
        ],
        isError: true,
      }
    }

    // Generate task ID
    const taskId = generateId(12)

    // Validate task data
    let validatedData
    try {
      validatedData = insertTaskSchema.parse({
        ...input,
        id: taskId,
        userId: user.id,
        status: 'pending',
        progress: 0,
        logs: [],
      })
    } catch (validationError: any) {
      // Handle Zod validation errors with specific messages
      const errorMessage = validationError?.errors?.[0]?.message || 'Invalid request parameters'
      const fieldPath = validationError?.errors?.[0]?.path?.join('.') || 'unknown field'

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Invalid request',
              message: `Validation failed: ${errorMessage}`,
              field: fieldPath,
              hint:
                fieldPath === 'repoUrl'
                  ? 'Repository URL must be a valid GitHub repository URL. Format: https://github.com/owner/repo'
                  : 'Check that all required fields are provided with valid values.',
            }),
          },
        ],
        isError: true,
      }
    }

    // Trigger task creation via internal REST API (which uses after() for proper serverless execution)
    // This delegates to the existing POST /api/tasks endpoint which handles:
    // - Task insertion
    // - Branch name generation (via after())
    // - Title generation (via after())
    // - Task execution (via after())
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXTAUTH_URL || 'http://localhost:3000'

    try {
      const response = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          id: taskId, // Use our pre-generated ID
          prompt: validatedData.prompt,
          repoUrl: validatedData.repoUrl,
          selectedAgent: validatedData.selectedAgent,
          selectedModel: validatedData.selectedModel,
          installDependencies: validatedData.installDependencies,
          keepAlive: validatedData.keepAlive,
          maxDuration: validatedData.maxDuration,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Task creation failed',
                message: errorData.error || 'The server could not process the request.',
                hint: 'Check the web UI for more details or try again later.',
                status: response.status,
              }),
            },
          ],
          isError: true,
        }
      }

      const responseData = await response.json()
      const newTask = responseData.task

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
    } catch (fetchError) {
      console.error('Error calling internal API')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Task execution failed',
              message: 'Internal API call failed.',
              hint: 'The server may be unavailable. Check your network connection and try again later.',
            }),
          },
        ],
        isError: true,
      }
    }
  } catch (error) {
    console.error('Error creating task')
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to create task',
            message: 'An unexpected error occurred.',
            hint: 'Please try again. If the problem persists, contact support.',
          }),
        },
      ],
      isError: true,
    }
  }
}
