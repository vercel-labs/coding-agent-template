import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { executeTask } from '@/lib/inngest/functions/execute-task'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executeTask],
})
