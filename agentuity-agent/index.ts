import type { AgentHandler } from '@agentuity/sdk'
import { executeTaskCore } from '../lib/orchestration/task-executor'
import { AgentuityStepRunner } from '../lib/orchestration/providers/agentuity'
import { createTaskLogger } from '../lib/utils/task-logger'
import type { TaskExecutionParams } from '../lib/orchestration/types'

const handler: AgentHandler = async (request, response, context) => {
  const params = (await request.data.json()) as unknown as TaskExecutionParams
  const { taskId } = params

  context.logger.info(`Starting task execution for ${taskId}`)

  const logStream = await context.stream.create(`task-${taskId}`, {
    contentType: 'text/plain',
    metadata: { taskId, type: 'execution-logs' },
  })

  context.waitUntil(async () => {
    const logger = createTaskLogger(taskId)

    const agentLogger = {
      info: async (msg: string) => {
        await logStream.write(`[INFO] ${msg}\n`)
        context.logger.info(msg)
      },
      error: async (msg: string) => {
        await logStream.write(`[ERROR] ${msg}\n`)
        context.logger.error(msg)
      },
      success: async (msg: string) => {
        await logStream.write(`[SUCCESS] ${msg}\n`)
        context.logger.info(msg)
      },
      command: async (cmd: string) => {
        await logStream.write(`$ ${cmd}\n`)
        context.logger.debug(`Executing: ${cmd}`)
      },
      updateStatus: logger.updateStatus.bind(logger),
      updateProgress: logger.updateProgress.bind(logger),
    }

    try {
      const stepRunner = new AgentuityStepRunner(context.logger)
      const result = await executeTaskCore(params, agentLogger as typeof logger, stepRunner)

      await context.kv.set('task-results', taskId, result)
      await logStream.write('[COMPLETE] Task execution finished\n')

      context.logger.info(`Task ${taskId} completed successfully`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logStream.write(`[FAILED] ${errorMessage}\n`)
      context.logger.error(`Task ${taskId} failed:`, error)
    } finally {
      await logStream.close()
    }
  })

  return response.json({
    taskId,
    status: 'started',
    logsUrl: logStream.url,
    message: 'Task execution started in background',
  })
}

export default handler
