import { Sandbox } from '@vercel/sandbox'
import { LogEntry } from '@/lib/db/schema'

export interface SandboxConfig {
  repoUrl: string
  timeout?: string
  ports?: number[]
  runtime?: string
  resources?: {
    vcpus?: number
  }
  taskPrompt?: string
  selectedAgent?: string
  selectedModel?: string
  preDeterminedBranchName?: string
  existingBranchName?: string
  onProgress?: (progress: number, message: string) => Promise<void>
}

export interface SandboxResult {
  success: boolean
  sandbox?: Sandbox
  domain?: string
  branchName?: string
  error?: string
}

export interface AgentExecutionResult {
  success: boolean
  output?: string
  agentResponse?: string
  cliName?: string
  changesDetected?: boolean
  error?: string
  streamingLogs?: unknown[]
  logs?: LogEntry[]
}
