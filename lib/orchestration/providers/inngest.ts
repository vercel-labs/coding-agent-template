import { inngest } from '@/lib/inngest/client'
import type { OrchestratorProvider } from './types'
import type { TaskExecutionParams, ExecutionHandle, StepRunner } from '../types'

export class InngestOrchestrator implements OrchestratorProvider {
  readonly type = 'inngest' as const

  async submitTask(params: TaskExecutionParams): Promise<ExecutionHandle> {
    const result = await inngest.send({
      name: 'task/execute',
      data: params,
    })

    return {
      id: params.taskId,
      type: 'inngest',
      metadata: result,
    }
  }
}

export class InngestStepRunner implements StepRunner {
  constructor(
    private inngestStep: {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<unknown>
    },
  ) {}

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return (await this.inngestStep.run(name, fn)) as T
  }
}
