import { useEffect, useRef, useCallback } from 'react'
import { createClientLogger, ClientLogger } from '@/lib/utils/client-logger'

/**
 * Hook that creates a client logger for a task and provides helper methods
 * The logger automatically batches and sends logs to the server
 */
export function useClientLogger(taskId: string | null | undefined) {
  const loggerRef = useRef<ClientLogger | null>(null)

  // Create logger when taskId is available
  useEffect(() => {
    if (taskId && !loggerRef.current) {
      loggerRef.current = createClientLogger(taskId)
    }

    // Cleanup: flush any pending logs when component unmounts
    return () => {
      if (loggerRef.current) {
        loggerRef.current.flush()
      }
    }
  }, [taskId])

  // Helper methods that safely call the logger
  const info = useCallback(
    (message: string) => {
      if (loggerRef.current) {
        loggerRef.current.info(message)
      }
    },
    [loggerRef],
  )

  const command = useCallback(
    (message: string) => {
      if (loggerRef.current) {
        loggerRef.current.command(message)
      }
    },
    [loggerRef],
  )

  const error = useCallback(
    (message: string) => {
      if (loggerRef.current) {
        loggerRef.current.error(message)
      }
    },
    [loggerRef],
  )

  const success = useCallback(
    (message: string) => {
      if (loggerRef.current) {
        loggerRef.current.success(message)
      }
    },
    [loggerRef],
  )

  const flush = useCallback(() => {
    if (loggerRef.current) {
      loggerRef.current.flush()
    }
  }, [loggerRef])

  return {
    info,
    command,
    error,
    success,
    flush,
  }
}
