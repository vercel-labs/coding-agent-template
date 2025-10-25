/**
 * Client-side logger that sends logs to the server for storage
 * All logs are prefixed with [CLIENT] and stored in the task's log database
 */

import { LogEntry } from '@/lib/db/schema'

export class ClientLogger {
  private taskId: string
  private batchQueue: LogEntry[] = []
  private batchTimeout: NodeJS.Timeout | null = null
  private readonly BATCH_DELAY = 500 // ms
  private readonly MAX_BATCH_SIZE = 10

  constructor(taskId: string) {
    this.taskId = taskId
  }

  /**
   * Send logs to the server
   */
  private async sendToServer(logs: LogEntry[]): Promise<void> {
    try {
      const response = await fetch(`/api/tasks/${this.taskId}/client-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
      })

      if (!response.ok) {
        console.error('Failed to send client logs to server')
      }
    } catch (error) {
      console.error('Error sending client logs:', error)
    }
  }

  /**
   * Flush the batch queue immediately
   */
  private flushBatch(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }

    if (this.batchQueue.length > 0) {
      const logsToSend = [...this.batchQueue]
      this.batchQueue = []
      this.sendToServer(logsToSend)
    }
  }

  /**
   * Add a log entry to the batch queue
   */
  private enqueue(type: LogEntry['type'], message: string): void {
    const logEntry: LogEntry = {
      type,
      message: `[CLIENT] ${message}`,
      timestamp: new Date(),
    }

    this.batchQueue.push(logEntry)

    // Flush immediately if batch size reached
    if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
      this.flushBatch()
      return
    }

    // Otherwise, schedule a batch flush
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
    }

    this.batchTimeout = setTimeout(() => {
      this.flushBatch()
    }, this.BATCH_DELAY)
  }

  /**
   * Log an info message
   */
  info(message: string): void {
    this.enqueue('info', message)
    console.log(`[CLIENT] ${message}`)
  }

  /**
   * Log a command
   */
  command(message: string): void {
    this.enqueue('command', message)
    console.log(`[CLIENT] $ ${message}`)
  }

  /**
   * Log an error message
   */
  error(message: string): void {
    this.enqueue('error', message)
    console.error(`[CLIENT] ${message}`)
  }

  /**
   * Log a success message
   */
  success(message: string): void {
    this.enqueue('success', message)
    console.log(`[CLIENT] ✓ ${message}`)
  }

  /**
   * Flush any pending logs immediately
   */
  flush(): void {
    this.flushBatch()
  }
}

/**
 * Create a client logger instance for a specific task
 */
export function createClientLogger(taskId: string): ClientLogger {
  return new ClientLogger(taskId)
}
