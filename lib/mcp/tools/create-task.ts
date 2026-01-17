/**
 * MCP Tool: Create Task
 *
 * Creates a new coding task and returns the task ID.
 * Delegates to the same logic as POST /api/tasks.
 */

import { db } from '@/lib/db/client'
import { tasks, users, insertTaskSchema } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { checkRateLimit } from '@/lib/utils/rate-limit'
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

    // Return success response with task ID
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            taskId: newTask.id,
            status: newTask.status,
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
