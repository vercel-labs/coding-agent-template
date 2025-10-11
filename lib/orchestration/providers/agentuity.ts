import type { OrchestratorProvider } from './types'
import type { TaskExecutionParams, ExecutionHandle, StepRunner } from '../types'

export class AgentuityOrchestrator implements OrchestratorProvider {
  readonly type = 'agentuity' as const

  async submitTask(params: TaskExecutionParams): Promise<ExecutionHandle> {
    if (!process.env.AGENTUITY_API_KEY) {
      throw new Error('AGENTUITY_API_KEY environment variable is required')
    }

    try {
      const agentUrl = process.env.AGENTUITY_AGENT_URL || 'http://localhost:3001'

      const response = await fetch(agentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AGENTUITY_API_KEY}`,
        },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        throw new Error(`Failed to submit task to Agentuity: ${response.statusText}`)
      }

      const result = await response.json()

      return {
        id: params.taskId,
        type: 'agentuity',
        metadata: result,
      }
    } catch (error) {
      throw new Error(`Failed to submit task to Agentuity: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export class AgentuityStepRunner implements StepRunner {
  constructor(private logger?: { info: (msg: string) => void }) {}

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.logger?.info(`[Step: ${name}] Starting...`)
    const result = await fn()
    this.logger?.info(`[Step: ${name}] Completed`)
    return result
  }
}
