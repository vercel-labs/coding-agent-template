import type { SandboxType } from '@/lib/sandbox/providers/types'

export type OrchestratorType = 'inngest' | 'agentuity'

export interface TaskExecutionParams {
  taskId: string
  prompt: string
  repoUrl: string
  selectedAgent: string
  selectedModel?: string
  installDependencies?: boolean
  maxDuration?: number
  sandboxType: SandboxType
  aiBranchName?: string
}

export interface ExecutionHandle {
  id: string
  type: OrchestratorType
  metadata?: Record<string, unknown>
}

export interface TaskStatus {
  status: 'pending' | 'processing' | 'completed' | 'error' | 'stopped'
  progress: number
  message?: string
  branchName?: string
  sandboxUrl?: string
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'error' | 'success' | 'command'
  message: string
}

export interface TaskExecutionResult {
  success: boolean
  cancelled?: boolean
  branchName?: string
  error?: string
}

export interface StepRunner {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>
}
