import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema, connectors } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { eq, desc, or, and, isNull } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { generateTaskTitle, createFallbackTitle } from '@/lib/utils/title-generator'
import { decrypt } from '@/lib/crypto'
import { getAuthFromRequest } from '@/lib/auth/api-token'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { processTaskWithTimeout } from '@/lib/tasks/process-task'

export async function GET(request: NextRequest) {
  try {
    // Get user from Bearer token or session
    const user = await getAuthFromRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tasks for this user only (exclude soft-deleted tasks)
    const userTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))

    return NextResponse.json({ tasks: userTasks })
  } catch (error) {
    console.error('Error fetching tasks')
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user from Bearer token or session
    const user = await getAuthFromRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check rate limit (convert null to undefined for type compatibility)
    const rateLimit = await checkRateLimit({ id: user.id, email: user.email ?? undefined })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'You have reached your daily message limit. Please try again later.',
          remaining: rateLimit.remaining,
          total: rateLimit.total,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 },
      )
    }

    const body = await request.json()

    // Use provided ID or generate a new one
    const taskId = body.id || generateId(12)
    const validatedData = insertTaskSchema.parse({
      ...body,
      id: taskId,
      userId: user.id,
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
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
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

        await logger.success('Generated AI branch name')
      } catch (error) {
        console.error('Error generating AI branch name')

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
          await logger.info('Using fallback branch name')
        } catch (dbError) {
          console.error('Error updating task with fallback branch name')
        }
      }
    })

    // Generate AI title after response is sent (non-blocking)
    after(async () => {
      try {
        // Check if AI Gateway API key is available
        if (!process.env.AI_GATEWAY_API_KEY) {
          console.log('AI_GATEWAY_API_KEY not available, skipping AI title generation')
          return
        }

        // Extract repository name from URL for context
        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        // Generate AI title
        const aiTitle = await generateTaskTitle({
          prompt: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        // Update task with AI-generated title
        await db
          .update(tasks)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
      } catch (error) {
        console.error('Error generating AI title')

        // Fallback to truncated prompt
        const fallbackTitle = createFallbackTitle(validatedData.prompt)

        try {
          await db
            .update(tasks)
            .set({
              title: fallbackTitle,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        } catch (dbError) {
          console.error('Error updating task with fallback title')
        }
      }
    })

    // Get user's API keys, GitHub token, and GitHub user info BEFORE entering after() block (where session is not accessible)
    // Pass user.id directly to support both session-based and API token-based authentication
    // Parallelize these independent async operations with Promise.all() for better performance
    const [userApiKeys, userGithubToken, githubUser, maxSandboxDuration] = await Promise.all([
      getUserApiKeys(user.id),
      getUserGitHubToken(user.id),
      getGitHubUser(user.id),
      getMaxSandboxDuration(user.id),
    ])

    // Get MCP servers for this user (must be done before after() block)
    // Use user.id from dual-auth (supports both session cookies and API tokens)
    let mcpServers: (typeof connectors.$inferSelect)[] = []
    try {
      const userConnectors = await db
        .select()
        .from(connectors)
        .where(and(eq(connectors.userId, user.id), eq(connectors.status, 'connected')))
      mcpServers = userConnectors.map((c) => ({
        ...c,
        env: (() => {
          if (!c.env) return null
          try {
            const decrypted = decrypt(c.env)
            return decrypted ? JSON.parse(decrypted) : null
          } catch {
            return null
          }
        })(),
        oauthClientSecret: c.oauthClientSecret ? decrypt(c.oauthClientSecret) : null,
      }))
    } catch {
      // Continue without MCP servers
    }

    // Process the task asynchronously with timeout
    // CRITICAL: Wrap in after() to ensure Vercel doesn't kill the function after response
    // Without this, serverless functions terminate immediately after sending the response
    after(async () => {
      try {
        await processTaskWithTimeout({
          taskId: newTask.id,
          prompt: validatedData.prompt,
          repoUrl: validatedData.repoUrl || '',
          maxDuration: validatedData.maxDuration || maxSandboxDuration,
          selectedAgent: validatedData.selectedAgent || 'claude',
          selectedModel: validatedData.selectedModel,
          installDependencies: validatedData.installDependencies || false,
          keepAlive: validatedData.keepAlive || false,
          sourceBranch: validatedData.sourceBranch,
          apiKeys: userApiKeys,
          githubToken: userGithubToken,
          githubUser,
          userId: user.id,
          mcpServers,
        })
      } catch (error) {
        console.error('Task processing failed')
        // Error handling is already done inside processTaskWithTimeout
      }
    })

    return NextResponse.json({ task: newTask })
  } catch (error) {
    console.error('Error creating task')
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get user from Bearer token or session
    const user = await getAuthFromRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Build the where conditions for task status
    const statusConditions = []
    if (actions.includes('completed')) {
      statusConditions.push(eq(tasks.status, 'completed'))
    }
    if (actions.includes('failed')) {
      statusConditions.push(eq(tasks.status, 'error'))
    }
    if (actions.includes('stopped')) {
      statusConditions.push(eq(tasks.status, 'stopped'))
    }

    if (statusConditions.length === 0) {
      return NextResponse.json({ error: 'No valid actions specified' }, { status: 400 })
    }

    // Delete tasks based on conditions AND user ownership
    const statusClause = statusConditions.length === 1 ? statusConditions[0] : or(...statusConditions)
    const whereClause = and(statusClause, eq(tasks.userId, user.id))
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
    console.error('Error deleting tasks')
    return NextResponse.json({ error: 'Failed to delete tasks' }, { status: 500 })
  }
}
