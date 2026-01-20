/**
 * MCP Tool: Get Task
 *
 * Retrieves a task by ID with full details including logs, status, and PR info.
 * Delegates to the same logic as GET /api/tasks/[taskId].
 */

import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { McpToolHandler } from '../types'
import { GetTaskInput } from '../schemas'

export const getTaskHandler: McpToolHandler<GetTaskInput> = async (input, context) => {
  try {
    // Check authentication
    const userId = context?.extra?.authInfo?.clientId
    if (!userId) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      }
    }

    // Get task (user-scoped)
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

    // Return task details
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: task.id,
            status: task.status,
            progress: task.progress,
            prompt: task.prompt,
            title: task.title,
            repoUrl: task.repoUrl,
            branchName: task.branchName,
            sourceBranch: task.sourceBranch,
            selectedAgent: task.selectedAgent,
            selectedModel: task.selectedModel,
            sandboxUrl: task.sandboxUrl,
            prUrl: task.prUrl,
            prNumber: task.prNumber,
            prStatus: task.prStatus,
            logs: task.logs,
            error: task.error,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            completedAt: task.completedAt,
          }),
        },
      ],
    }
  } catch (error) {
    console.error('Error fetching task')
    return {
      content: [{ type: 'text', text: 'Failed to fetch task' }],
      isError: true,
    }
  }
}
