import { Sandbox } from '@vercel/sandbox'
import { LogEntry } from '@/lib/db/schema'

export interface SandboxConfig {
  taskId: string
  repoUrl: string
  githubToken?: string | null
  gitAuthorName?: string
  gitAuthorEmail?: string
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  }
  timeout?: string
  ports?: number[]
  runtime?: string
  resources?: {
    vcpus?: number
  }
  taskPrompt?: string
  selectedAgent?: string
  selectedModel?: string
  installDependencies?: boolean
  keepAlive?: boolean
  preDeterminedBranchName?: string
  onProgress?: (progress: number, message: string) => Promise<void>
  onCancellationCheck?: () => Promise<boolean>
}

export interface SandboxResult {
  success: boolean
  sandbox?: Sandbox
  domain?: string
  branchName?: string
  error?: string
  cancelled?: boolean
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
  sessionId?: string // For Cursor agent session resumption
}
