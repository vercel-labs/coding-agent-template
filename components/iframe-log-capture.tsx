'use client'

import { useEffect } from 'react'

interface IframeLogCaptureProps {
  taskId: string
  sandboxUrl: string | null
}

export function IframeLogCapture({ taskId, sandboxUrl }: IframeLogCaptureProps) {
  useEffect(() => {
    if (!sandboxUrl) return

    const handleMessage = async (event: MessageEvent) => {
      // Verify the origin matches the sandbox URL
      try {
        const sandboxOrigin = new URL(sandboxUrl).origin
        if (event.origin !== sandboxOrigin) {
          return
        }
      } catch {
        return
      }

      // Check if this is a log message from the sandbox
      if (event.data && event.data.type === 'sandbox-log') {
        const { logType, message } = event.data

        // Send to API
        try {
          await fetch(`/api/tasks/${taskId}/client-logs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: logType === 'error' ? 'error' : 'info',
              message,
            }),
          })
        } catch (error) {
          console.error('Failed to send client log:', error)
        }
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [taskId, sandboxUrl])

  return null
}
