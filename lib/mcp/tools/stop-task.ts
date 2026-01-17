/**
 * MCP Tool: Stop Task
 *
 * Stops a running task and terminates its sandbox.
 * Delegates to the same logic as PATCH /api/tasks/[taskId] with action=stop.
 */

import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { killSandbox } from '@/lib/sandbox/sandbox-registry'
import { McpToolHandler } from '../types'
import { StopTaskInput } from '../schemas'

export const stopTaskHandler: McpToolHandler<StopTaskInput> = async (input, context) => {
  try {
    // Check authentication
    const userId = context?.extra?.authInfo?.clientId
    if (!userId) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      }
    }

    // Check if task exists and belongs to user
    const [existingTask] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .limit(1)

    if (!existingTask) {
      return {
        content: [{ type: 'text', text: 'Task not found' }],
        isError: true,
      }
    }

    // Only allow stopping tasks that are currently processing
    if (existingTask.status !== 'processing') {
      return {
        content: [{ type: 'text', text: 'Task can only be stopped when it is in progress' }],
        isError: true,
      }
    }

    const logger = createTaskLogger(input.taskId)

    // Log the stop request
    await logger.info('Stop request received')

    // Update task status to stopped
    const [updatedTask] = await db
      .update(tasks)
      .set({
        status: 'stopped',
        error: 'Task was stopped by user',
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId))
      .returning()

    // Kill the sandbox
    try {
      const killResult = await killSandbox(input.taskId)
      if (killResult.success) {
        await logger.success('Sandbox terminated successfully')
      } else {
        await logger.error('Failed to terminate sandbox')
      }
    } catch (killError) {
      console.error('Failed to kill sandbox during stop')
      await logger.error('Failed to terminate sandbox')
    }

    await logger.error('Task stopped by user')

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            taskId: updatedTask.id,
            status: updatedTask.status,
            message: 'Task stopped successfully',
          }),
        },
      ],
    }
  } catch (error) {
    console.error('Error stopping task')
    return {
      content: [{ type: 'text', text: 'Failed to stop task' }],
      isError: true,
    }
  }
}
