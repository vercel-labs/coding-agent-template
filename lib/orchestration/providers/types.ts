import type { TaskExecutionParams, ExecutionHandle, TaskStatus, LogEntry, OrchestratorType } from '../types'

export interface OrchestratorProvider {
  readonly type: OrchestratorType

  submitTask(params: TaskExecutionParams): Promise<ExecutionHandle>

  getStatus?(taskId: string): Promise<TaskStatus>

  streamLogs?(taskId: string): AsyncIterator<LogEntry>
}
