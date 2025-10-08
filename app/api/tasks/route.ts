import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { eq, desc, or } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { inngest } from '@/lib/inngest/client'

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

    // Trigger Inngest function to process the task
    after(async () => {
      try {
        // Get the AI-generated branch name if available
        let aiBranchName: string | undefined

        // Wait a moment to see if branch name was generated
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const [taskWithBranch] = await db.select().from(tasks).where(eq(tasks.id, taskId))
        if (taskWithBranch?.branchName) {
          aiBranchName = taskWithBranch.branchName
        }

        await inngest.send({
          name: 'task/execute',
          data: {
            taskId: newTask.id,
            prompt: validatedData.prompt,
            repoUrl: validatedData.repoUrl || '',
            selectedAgent: validatedData.selectedAgent || 'claude',
            selectedModel: validatedData.selectedModel,
            installDependencies: validatedData.installDependencies || false,
            maxDuration: validatedData.maxDuration || 5,
            sandboxType: validatedData.sandboxType || 'vercel',
            aiBranchName,
          },
        })
      } catch (error) {
        console.error('Failed to trigger Inngest function:', error)
      }
    })

    return NextResponse.json({ task: newTask })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
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
