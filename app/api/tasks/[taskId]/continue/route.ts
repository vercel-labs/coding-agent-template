import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks, taskMessages, connectors } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { Sandbox } from '@vercel/sandbox'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { decrypt } from '@/lib/crypto'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'

export async function POST(req: NextRequest, context: { params: { taskId: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await context.params
    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get the task and verify ownership
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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

    // Get user's API keys and GitHub token
    const userApiKeys = await getUserApiKeys()
    const userGithubToken = await getUserGitHubToken()

    // Process the continuation asynchronously
    after(async () => {
      await continueTask(
        taskId,
        message.trim(),
        task.repoUrl || '',
        task.branchName,
        task.selectedAgent || 'claude',
        task.selectedModel,
        task.installDependencies || false,
        task.maxDuration || 5,
        userApiKeys,
        userGithubToken,
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
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  maxDuration: number = 5,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
  githubToken?: string | null,
) {
  let sandbox: Sandbox | null = null
  const logger = createTaskLogger(taskId)

  try {
    console.log('Continuing task with new message')

    await logger.updateStatus('processing', 'Processing follow-up message...')
    await logger.updateProgress(10, 'Initializing continuation...')

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }

    await logger.updateProgress(15, 'Creating sandbox environment')
    console.log('Creating sandbox for continuation')

    // Create sandbox and checkout the existing branch
    const sandboxResult = await createSandbox(
      {
        taskId,
        repoUrl,
        githubToken,
        apiKeys,
        timeout: `${maxDuration}m`,
        ports: [3000],
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
        sandboxUrl: domain || undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))

    await logger.updateProgress(50, 'Executing agent with follow-up message')
    console.log('Starting agent execution')

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

    const agentResult = await executeAgentInSandbox(
      sandbox,
      prompt,
      selectedAgent as AgentType,
      logger,
      selectedModel,
      mcpServers,
      undefined,
      apiKeys,
    )

    console.log('Agent execution completed')

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

      // Push changes to branch
      const commitMessage = `${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`
      const pushResult = await pushChangesToBranch(sandbox, branchName, commitMessage, logger)

      // Shutdown sandbox
      unregisterSandbox(taskId)
      const shutdownResult = await shutdownSandbox(sandbox)
      if (shutdownResult.success) {
        await logger.success('Sandbox shutdown completed')
      } else {
        await logger.error('Sandbox shutdown failed')
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

    try {
      if (sandbox) {
        unregisterSandbox(taskId)
        await shutdownSandbox(sandbox)
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError)
    }

    await logger.updateStatus('error')
    await logger.error('Task failed to continue')

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    await db
      .update(tasks)
      .set({
        error: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
  }
}

