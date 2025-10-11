import { inngest } from '../client'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { executeTaskCore } from '@/lib/orchestration/task-executor'
import { InngestStepRunner } from '@/lib/orchestration/providers/inngest'

export const executeTask = inngest.createFunction(
  {
    id: 'execute-task',
    retries: 0,
  },
  { event: 'task/execute' },
  async ({ event, step }) => {
    const logger = createTaskLogger(event.data.taskId)
    const stepRunner = new InngestStepRunner(step)

    return executeTaskCore(event.data, logger, stepRunner)
  },
)
