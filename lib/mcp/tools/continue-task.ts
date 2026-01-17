/**
 * MCP Tool: Continue Task
 *
 * Sends a follow-up message to continue a task with additional instructions.
 * Delegates to the same logic as POST /api/tasks/[taskId]/continue.
 */

import { db } from '@/lib/db/client'
import { tasks, users, taskMessages } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { McpToolHandler } from '../types'
import { ContinueTaskInput } from '../schemas'

export const continueTaskHandler: McpToolHandler<ContinueTaskInput> = async (input, context) => {
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

    // Check rate limit for follow-up messages
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

    // Get the task and verify ownership
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return {
        content: [{ type: 'text', text: 'Task not found' }],
        isError: true,
      }
    }

    // Check if task has a branch name (required to continue)
    if (!task.branchName) {
      return {
        content: [{ type: 'text', text: 'Task does not have a branch to continue from' }],
        isError: true,
      }
    }

    // Save the user's message
    await db.insert(taskMessages).values({
      id: generateId(12),
      taskId: input.taskId,
      role: 'user',
      content: input.message.trim(),
    })

    // Reset task status and progress
    await db
      .update(tasks)
      .set({
        status: 'processing',
        progress: 0,
        updatedAt: new Date(),
        completedAt: null,
      })
      .where(eq(tasks.id, input.taskId))

    // Note: The actual task continuation happens asynchronously in the background
    // Similar to the API route's after() block, but that's handled by the MCP server

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            taskId: input.taskId,
            message: 'Task continuation started',
          }),
        },
      ],
    }
  } catch (error) {
    console.error('Error continuing task')
    return {
      content: [{ type: 'text', text: 'Failed to continue task' }],
      isError: true,
    }
  }
}
