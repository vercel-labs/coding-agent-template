import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createInfoLog, createCommandLog, createErrorLog, createSuccessLog, LogEntry } from './logging'

export class TaskLogger {
  private taskId: string

  constructor(taskId: string) {
    this.taskId = taskId
  }

  /**
   * Append a log entry to the database immediately
   */
  async append(type: 'info' | 'command' | 'error' | 'success', message: string): Promise<void> {
    try {
      // Create the log entry with timestamp
      let logEntry: LogEntry
      switch (type) {
        case 'info':
          logEntry = createInfoLog(message)
          break
        case 'command':
          logEntry = createCommandLog(message)
          break
        case 'error':
          logEntry = createErrorLog(message)
          break
        case 'success':
          logEntry = createSuccessLog(message)
          break
        default:
          logEntry = createInfoLog(message)
      }

      // Get current task to preserve existing logs
      const currentTask = await db.select().from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingLogs = currentTask[0]?.logs || []

      // Append the new log entry
      await db
        .update(tasks)
        .set({
          logs: [...existingLogs, logEntry],
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
  async info(message: string): Promise<void> {
    return this.append('info', message)
  }

  async command(message: string): Promise<void> {
    return this.append('command', message)
  }

  async error(message: string): Promise<void> {
    return this.append('error', message)
  }

  async success(message: string): Promise<void> {
    return this.append('success', message)
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
