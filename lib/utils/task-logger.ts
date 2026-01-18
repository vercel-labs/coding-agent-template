import { db } from '@/lib/db/client'
import { tasks, SubAgentActivity } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  createInfoLog,
  createCommandLog,
  createErrorLog,
  createSuccessLog,
  createSubAgentLog,
  LogEntry,
  AgentSource,
} from './logging'
import { generateId } from './id'

export class TaskLogger {
  private taskId: string
  private agentContext?: AgentSource

  constructor(taskId: string, agentContext?: AgentSource) {
    this.taskId = taskId
    this.agentContext = agentContext
  }

  /**
   * Create a new logger instance with a specific agent context
   */
  withAgentContext(context: AgentSource): TaskLogger {
    const newLogger = new TaskLogger(this.taskId, context)
    return newLogger
  }

  /**
   * Append a log entry to the database immediately
   */
  async append(
    type: 'info' | 'command' | 'error' | 'success' | 'subagent',
    message: string,
    agentSource?: AgentSource,
  ): Promise<void> {
    try {
      // Use provided agentSource, fall back to instance context
      const source = agentSource || this.agentContext

      // Create the log entry with timestamp and agent source
      let logEntry: LogEntry
      switch (type) {
        case 'info':
          logEntry = createInfoLog(message, source)
          break
        case 'command':
          logEntry = createCommandLog(message, undefined, source)
          break
        case 'error':
          logEntry = createErrorLog(message, source)
          break
        case 'success':
          logEntry = createSuccessLog(message, source)
          break
        case 'subagent':
          logEntry = createSubAgentLog(
            message,
            source?.name || 'unknown',
            source?.parentAgent || 'primary',
            source?.subAgentId,
          )
          break
        default:
          logEntry = createInfoLog(message, source)
      }

      // Get current task to preserve existing logs
      const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingLogs = currentTask[0]?.logs || []

      // Append the new log entry and update heartbeat
      await db
        .update(tasks)
        .set({
          logs: [...existingLogs, logEntry],
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, this.taskId))

      // Task log: ${type.toUpperCase()}: ${message.substring(0, 100)}
    } catch {
      // Failed to append log to database
      // Don't throw - we don't want logging failures to break the main process
    }
  }

  /**
   * Convenience methods for different log types
   */
  async info(message: string, agentSource?: AgentSource): Promise<void> {
    return this.append('info', message, agentSource)
  }

  async command(message: string, agentSource?: AgentSource): Promise<void> {
    return this.append('command', message, agentSource)
  }

  async error(message: string, agentSource?: AgentSource): Promise<void> {
    return this.append('error', message, agentSource)
  }

  async success(message: string, agentSource?: AgentSource): Promise<void> {
    return this.append('success', message, agentSource)
  }

  /**
   * Log a sub-agent event (start, complete, error)
   */
  async subagent(message: string, subAgentName: string, parentAgent?: string): Promise<void> {
    return this.append('subagent', message, {
      name: subAgentName,
      isSubAgent: true,
      parentAgent: parentAgent || this.agentContext?.name,
    })
  }

  /**
   * Start tracking a new sub-agent
   */
  async startSubAgent(name: string, description?: string, parentAgent?: string): Promise<string> {
    const subAgentId = generateId()
    const activity: SubAgentActivity = {
      id: subAgentId,
      name,
      status: 'starting',
      startedAt: new Date(),
      description,
    }

    try {
      // Get current task
      const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingActivity = currentTask[0]?.subAgentActivity || []
      const existingLogs = currentTask[0]?.logs || []

      // Create log entry for sub-agent start
      const logEntry = createSubAgentLog(
        `Sub-agent started: ${name}${description ? ` - ${description}` : ''}`,
        name,
        parentAgent || this.agentContext?.name || 'primary',
        subAgentId,
      )

      // Update task with new sub-agent activity
      await db
        .update(tasks)
        .set({
          subAgentActivity: [...existingActivity, activity],
          currentSubAgent: name,
          logs: [...existingLogs, logEntry],
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, this.taskId))

      return subAgentId
    } catch {
      // Return ID even on failure to allow tracking
      return subAgentId
    }
  }

  /**
   * Update sub-agent status to running
   */
  async subAgentRunning(subAgentId: string): Promise<void> {
    try {
      const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingActivity = currentTask[0]?.subAgentActivity || []

      const updatedActivity = existingActivity.map((sa) =>
        sa.id === subAgentId ? { ...sa, status: 'running' as const } : sa,
      )

      await db
        .update(tasks)
        .set({
          subAgentActivity: updatedActivity,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, this.taskId))
    } catch {
      // Ignore errors
    }
  }

  /**
   * Mark a sub-agent as completed
   */
  async completeSubAgent(subAgentId: string, success: boolean = true): Promise<void> {
    try {
      const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingActivity = currentTask[0]?.subAgentActivity || []
      const existingLogs = currentTask[0]?.logs || []

      const subAgent = existingActivity.find((sa) => sa.id === subAgentId)
      if (!subAgent) return

      const updatedActivity = existingActivity.map((sa) =>
        sa.id === subAgentId
          ? {
              ...sa,
              status: success ? ('completed' as const) : ('error' as const),
              completedAt: new Date(),
            }
          : sa,
      )

      // Check if there are other running sub-agents
      const otherRunning = updatedActivity.find(
        (sa) => sa.id !== subAgentId && (sa.status === 'running' || sa.status === 'starting'),
      )

      // Create log entry for sub-agent completion
      const logEntry = createSubAgentLog(
        `Sub-agent ${success ? 'completed' : 'failed'}: ${subAgent.name}`,
        subAgent.name,
        this.agentContext?.name || 'primary',
        subAgentId,
      )

      await db
        .update(tasks)
        .set({
          subAgentActivity: updatedActivity,
          currentSubAgent: otherRunning?.name || null,
          logs: [...existingLogs, logEntry],
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, this.taskId))
    } catch {
      // Ignore errors
    }
  }

  /**
   * Send a heartbeat to indicate the task is still active
   * This helps prevent timeout when long-running sub-agents are active
   */
  async heartbeat(): Promise<void> {
    try {
      await db
        .update(tasks)
        .set({
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, this.taskId))
    } catch {
      // Ignore heartbeat errors
    }
  }

  /**
   * Update task progress along with a log message
   */
  async updateProgress(progress: number, message: string): Promise<void> {
    try {
      const logEntry = createInfoLog(message)

      // Get current task to preserve existing logs
      const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingLogs = currentTask[0]?.logs || []

      // Update both progress and logs
      await db
        .update(tasks)
        .set({
          progress,
          logs: [...existingLogs, logEntry],
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, this.taskId))

      // Task progress: ${progress}%
    } catch {
      // Failed to update progress
    }
  }

  /**
   * Update task status along with a log message
   * Note: completedAt is only set when PR is merged, not when status changes to 'completed'
   */
  async updateStatus(status: 'pending' | 'processing' | 'completed' | 'error', message?: string): Promise<void> {
    try {
      const updates: {
        status: 'pending' | 'processing' | 'completed' | 'error'
        updatedAt: Date
        logs?: LogEntry[]
      } = {
        status,
        updatedAt: new Date(),
      }

      if (message) {
        const logEntry = createInfoLog(message)
        const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
        const existingLogs = currentTask[0]?.logs || []
        updates.logs = [...existingLogs, logEntry]
      }

      await db.update(tasks).set(updates).where(eq(tasks.id, this.taskId))

      // Task status: ${status}
    } catch {
      // Failed to update status
    }
  }
}

/**
 * Create a logger instance for a specific task
 */
export function createTaskLogger(taskId: string): TaskLogger {
  return new TaskLogger(taskId)
}
