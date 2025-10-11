import { TaskLogger } from '@/lib/utils/task-logger'
import { AgentType } from '../agents'
import { Connector } from '@/lib/db/schema'

export type SandboxType = 'local' | 'docker' | 'e2b' | 'daytona' | 'vercel'

export interface SandboxConfig {
  taskId: string
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
  installDependencies?: boolean
  preDeterminedBranchName?: string
  existingBranchName?: string
  onProgress?: (progress: number, message: string) => Promise<void>
  onCancellationCheck?: () => Promise<boolean>
}

export interface SandboxInstance {
  id: string
  type: SandboxType
  domain?: string
  sshUrl?: string
  terminalUrl?: string
  vscodeUrl?: string
  metadata?: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nativeSandbox?: any
}

export interface ExecutionResult {
  success: boolean
  output?: string
  agentResponse?: string
  error?: string
  exitCode?: number
}

export interface SandboxResult {
  success: boolean
  sandbox?: SandboxInstance
  domain?: string
  branchName?: string
  error?: string
  cancelled?: boolean
}

export interface SandboxProvider {
  readonly type: SandboxType

  create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult>

  executeAgent(
    sandbox: SandboxInstance,
    instruction: string,
    agentType: AgentType,
    logger: TaskLogger,
    selectedModel?: string,
    mcpServers?: Connector[],
    onCancellationCheck?: () => Promise<boolean>,
  ): Promise<ExecutionResult>

  destroy(sandbox: SandboxInstance, logger: TaskLogger): Promise<{ success: boolean; error?: string }>

  pushChanges?(
    sandbox: SandboxInstance,
    branchName: string,
    commitMessage: string,
    logger: TaskLogger,
  ): Promise<{ success: boolean; pushFailed?: boolean }>

  snapshot?(
    sandbox: SandboxInstance,
    logger: TaskLogger,
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }>

  restore?(snapshotId: string, logger: TaskLogger): Promise<SandboxResult>
}
