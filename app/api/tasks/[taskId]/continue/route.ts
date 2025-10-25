import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks, taskMessages, connectors } from '@/lib/db/schema'
import { eq, and, asc, isNull } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { Sandbox } from '@vercel/sandbox'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { decrypt } from '@/lib/crypto'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'

export async function POST(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check rate limit for follow-up messages
    const rateLimit = await checkRateLimit(session.user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have reached the daily limit of ${rateLimit.total} messages (tasks + follow-ups). Your limit will reset at ${rateLimit.resetAt.toISOString()}`,
          remaining: rateLimit.remaining,
          total: rateLimit.total,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 },
      )
    }

    const { taskId } = await context.params
    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get the task and verify ownership
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task has a branch name (required to continue)
    if (!task.branchName) {
      return NextResponse.json({ error: 'Task does not have a branch to continue from' }, { status: 400 })
    }

    // Save the user's message
    await db.insert(taskMessages).values({
      id: generateId(12),
      taskId,
      role: 'user',
      content: message.trim(),
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
      .where(eq(tasks.id, taskId))

    // Get user's API keys, GitHub token, and GitHub user info
    const userApiKeys = await getUserApiKeys()
    const userGithubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()
    // Get max sandbox duration for this user (user-specific > global > env var)
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)

    // Process the continuation asynchronously
    after(async () => {
      await continueTask(
        taskId,
        message.trim(),
        task.repoUrl || '',
        task.branchName || '',
        task.maxDuration || maxSandboxDuration,
        task.selectedAgent || 'claude',
        task.selectedModel || undefined,
        task.installDependencies || false,
        userApiKeys,
        userGithubToken,
        githubUser,
      )
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error continuing task:', error)
    return NextResponse.json({ error: 'Failed to continue task' }, { status: 500 })
  }
}

async function continueTask(
  taskId: string,
  prompt: string,
  repoUrl: string,
  branchName: string,
  maxDuration: number,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
  githubToken?: string | null,
  githubUser?: {
    username: string
    name: string | null
    email: string | null
  } | null,
) {
  let sandbox: Sandbox | null = null
  let isResumedSandbox = false // Track if we reconnected to existing sandbox
  const logger = createTaskLogger(taskId)

  try {
    console.log('Continuing task with new message')

    await logger.updateStatus('processing', 'Processing follow-up message...')
    await logger.updateProgress(10, 'Initializing continuation...')

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }

    // Fetch task to get sandboxId and keepAlive settings
    const [currentTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!currentTask) {
      throw new Error('Task not found')
    }

    // Try to reconnect to existing sandbox if keepAlive was enabled
    console.log('Checking for existing sandbox:', {
      hasSandboxId: !!currentTask.sandboxId,
      sandboxId: currentTask.sandboxId,
      keepAlive: currentTask.keepAlive,
    })

    if (currentTask.sandboxId && currentTask.keepAlive) {
      try {
        await logger.info('Attempting to reconnect to existing sandbox')
        console.log('Calling Sandbox.get with sandboxId:', currentTask.sandboxId)
        const reconnectedSandbox = await Sandbox.get({
          sandboxId: currentTask.sandboxId,
          teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
          projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
          token: process.env.SANDBOX_VERCEL_TOKEN!,
        })

        if (reconnectedSandbox) {
          await logger.info('Successfully reconnected to existing sandbox')
          sandbox = reconnectedSandbox
          isResumedSandbox = true // Mark as resumed
          await logger.updateProgress(50, 'Executing agent with follow-up message')
        }
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        await logger.info('Could not reconnect to sandbox, will create new one')
      }
    }

    if (!sandbox) {
      // Create new sandbox
      await logger.updateProgress(15, 'Creating sandbox environment')
      console.log('Creating sandbox for continuation')

      // Detect the appropriate port for the project
      const port = await detectPortFromRepo(repoUrl, githubToken)
      console.log(`Detected port ${port} for project`)

      // Create sandbox and checkout the existing branch
      const sandboxResult = await createSandbox(
        {
          taskId,
          repoUrl,
          githubToken,
          gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
          gitAuthorEmail: githubUser?.username
            ? `${githubUser.username}@users.noreply.github.com`
            : 'agent@example.com',
          apiKeys,
          timeout: `${maxDuration}m`,
          ports: [port],
          runtime: 'node22',
          resources: { vcpus: 4 },
          taskPrompt: prompt,
          selectedAgent,
          selectedModel,
          installDependencies,
          preDeterminedBranchName: branchName, // Use existing branch
          onProgress: async (progress: number, message: string) => {
            await logger.updateProgress(progress, message)
          },
        },
        logger,
      )

      if (!sandboxResult.success) {
        throw new Error(sandboxResult.error || 'Failed to create sandbox')
      }

      const { sandbox: createdSandbox, domain } = sandboxResult
      sandbox = createdSandbox || null

      await db
        .update(tasks)
        .set({
          sandboxId: sandbox?.sandboxId || undefined,
          sandboxUrl: domain || undefined,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
    }

    console.log('Starting agent execution')

    // Fetch the last 5 messages for context (excluding the current message we just saved)
    const previousMessages = await db
      .select()
      .from(taskMessages)
      .where(eq(taskMessages.taskId, taskId))
      .orderBy(asc(taskMessages.createdAt))
      .limit(10) // Get last 10 to ensure we have at least 5 before the current one

    // Get the last 5 messages before the current one (which is the last message)
    const contextMessages = previousMessages.slice(-6, -1) // Last 6 excluding the very last one, giving us 5 messages

    // Build conversation history context - put the new request FIRST, then context
    // Sanitize the current prompt to prevent CLI option parsing issues
    const sanitizedPrompt = prompt
      .replace(/`/g, "'") // Replace backticks with single quotes
      .replace(/\$/g, '') // Remove dollar signs
      .replace(/\\/g, '') // Remove backslashes
      .replace(/^-/gm, ' -') // Prefix lines starting with dash to avoid CLI option parsing

    let promptWithContext = sanitizedPrompt
    // Only add conversation history if NOT using a resumed sandbox
    // When using --resume, the agent already has access to the full conversation history
    if (contextMessages.length > 0 && !isResumedSandbox) {
      let conversationHistory = '\n\n---\n\nFor context, here is the conversation history from this session:\n\n'
      contextMessages.forEach((msg) => {
        const role = msg.role === 'user' ? 'User' : 'A'
        // Escape special characters and limit length to avoid shell parsing issues
        const truncatedContent = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content
        // Remove problematic characters that could cause shell parsing issues
        const sanitizedContent = truncatedContent
          .replace(/`/g, "'") // Replace backticks with single quotes
          .replace(/\$/g, '') // Remove dollar signs
          .replace(/\\/g, '') // Remove backslashes
          .replace(/^-/gm, ' -') // Prefix lines starting with dash to avoid CLI option parsing
        conversationHistory += `${role}: ${sanitizedContent}\n\n`
      })
      promptWithContext = `${sanitizedPrompt}${conversationHistory}`
    }

    type Connector = typeof connectors.$inferSelect

    let mcpServers: Connector[] = []

    try {
      const session = await getServerSession()

      if (session?.user?.id) {
        const userConnectors = await db
          .select()
          .from(connectors)
          .where(and(eq(connectors.userId, session.user.id), eq(connectors.status, 'connected')))

        mcpServers = userConnectors.map((connector: Connector) => {
          const decryptedEnv = connector.env ? JSON.parse(decrypt(connector.env)) : null
          return {
            ...connector,
            env: decryptedEnv,
            oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
          }
        })

        if (mcpServers.length > 0) {
          await logger.info('Found connected MCP servers')
        }
      }
    } catch (mcpError) {
      console.error('Failed to fetch MCP servers:', mcpError)
      await logger.info('Warning: Could not fetch MCP servers, continuing without them')
    }

    if (!sandbox) {
      throw new Error('Sandbox is not available for agent execution')
    }

    // Generate agent message ID for streaming updates
    const agentMessageId = generateId()

    const agentResult = await executeAgentInSandbox(
      sandbox,
      promptWithContext,
      selectedAgent as AgentType,
      logger,
      selectedModel,
      mcpServers,
      undefined,
      apiKeys,
      isResumedSandbox, // Pass whether this is a resumed sandbox
      currentTask.agentSessionId || undefined, // Pass agent session ID for resumption
      taskId, // taskId for streaming updates
      agentMessageId, // agentMessageId for streaming updates
    )

    console.log('Agent execution completed')

    // Update agent session ID if provided (for Cursor agent resumption)
    if (agentResult.sessionId) {
      await db.update(tasks).set({ agentSessionId: agentResult.sessionId }).where(eq(tasks.id, taskId))
    }

    if (agentResult.success) {
      await logger.success('Agent execution completed')
      await logger.info('Code changes applied successfully')

      if (agentResult.agentResponse) {
        await logger.info('Agent response received')

        // Save the agent's response message
        try {
          await db.insert(taskMessages).values({
            id: generateId(12),
            taskId,
            role: 'agent',
            content: agentResult.agentResponse,
          })
        } catch (error) {
          console.error('Failed to save agent message:', error)
        }
      }

      // Generate AI-powered commit message
      let commitMessage: string
      try {
        // Extract repository name from URL for context
        let repoName: string | undefined
        try {
          const url = new URL(repoUrl)
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        if (process.env.AI_GATEWAY_API_KEY) {
          commitMessage = await generateCommitMessage({
            description: prompt,
            repoName,
            context: `${selectedAgent} agent follow-up`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(prompt)
        }
      } catch (error) {
        console.error('Error generating commit message:', error)
        commitMessage = createFallbackCommitMessage(prompt)
      }

      // Push changes to branch
      const pushResult = await pushChangesToBranch(sandbox, branchName, commitMessage, logger)

      // Conditionally shutdown sandbox based on task's keepAlive setting
      // Get the task to check keepAlive setting
      const [currentTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

      if (currentTask?.keepAlive) {
        // Keep sandbox alive for future follow-up messages
        await logger.info('Sandbox kept alive for follow-up messages')
      } else {
        // Shutdown sandbox
        unregisterSandbox(taskId)
        const shutdownResult = await shutdownSandbox(sandbox)
        if (shutdownResult.success) {
          await logger.success('Sandbox shutdown completed')
        } else {
          await logger.error('Sandbox shutdown failed')
        }
      }

      if (pushResult.pushFailed) {
        await logger.updateStatus('error')
        await logger.error('Task failed: Unable to push changes to repository')
        throw new Error('Failed to push changes to repository')
      } else {
        await logger.updateStatus('completed')
        await logger.updateProgress(100, 'Task completed successfully')
        console.log('Task continuation completed successfully')
      }
    } else {
      await logger.error('Agent execution failed')
      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error continuing task:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    const errorStack = error instanceof Error ? error.stack : undefined

    // Log detailed error for debugging
    console.error('Detailed error:', {
      message: errorMessage,
      stack: errorStack,
      taskId,
    })

    try {
      if (sandbox) {
        // Check keepAlive setting before shutting down sandbox on error
        const [currentTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

        if (currentTask?.keepAlive) {
          // Keep sandbox alive even on error for potential retry
          await logger.info('Sandbox kept alive despite error')
        } else {
          unregisterSandbox(taskId)
          await shutdownSandbox(sandbox)
        }
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError)
    }

    await logger.updateStatus('error')
    await logger.error('Task failed to continue')
    // Error details are saved to the database for debugging
    console.error('Task error details:', errorMessage)

    await db
      .update(tasks)
      .set({
        error: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
  }
}
