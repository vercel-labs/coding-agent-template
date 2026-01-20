/**
 * MCP Tool: List Tasks
 *
 * Lists tasks for the authenticated user with optional filters.
 * Delegates to the same logic as GET /api/tasks.
 */

import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { McpToolHandler } from '../types'
import { ListTasksInput } from '../schemas'

export const listTasksHandler: McpToolHandler<ListTasksInput> = async (input, context) => {
  try {
    // Check authentication
    const userId = context?.extra?.authInfo?.clientId
    if (!userId) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      }
    }

    // Build query conditions
    const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)]

    // Add status filter if provided
    if (input.status) {
      conditions.push(eq(tasks.status, input.status))
    }

    // Get tasks for this user (exclude soft-deleted tasks)
    const userTasks = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(input.limit || 20)

    // Return task list with essential fields
    const taskList = userTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      progress: task.progress,
      prompt: task.prompt?.substring(0, 200), // Truncate for list view
      repoUrl: task.repoUrl,
      branchName: task.branchName,
      sourceBranch: task.sourceBranch,
      selectedAgent: task.selectedAgent,
      prUrl: task.prUrl,
      prStatus: task.prStatus,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    }))

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tasks: taskList,
            count: taskList.length,
          }),
        },
      ],
    }
  } catch (error) {
    console.error('Error listing tasks')
    return {
      content: [{ type: 'text', text: 'Failed to list tasks' }],
      isError: true,
    }
  }
}
