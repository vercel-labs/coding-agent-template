'use client'

import { Task, LogEntry } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTasks } from '@/components/app-layout'

interface LogsPaneProps {
  task: Task
}

export function LogsPane({ task }: LogsPaneProps) {
  const [copiedLogs, setCopiedLogs] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef<number>(0)
  const hasInitialScrolled = useRef<boolean>(false)
  const { isSidebarOpen } = useTasks()

  // Scroll to bottom on initial load
  useEffect(() => {
    if (task.logs && task.logs.length > 0 && !hasInitialScrolled.current && logsContainerRef.current) {
      setTimeout(() => {
        if (logsContainerRef.current) {
          logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
          hasInitialScrolled.current = true
        }
      }, 100)
    }
  }, [task.logs])

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    const currentLogsLength = task.logs?.length || 0

    if (currentLogsLength > prevLogsLengthRef.current && prevLogsLengthRef.current > 0) {
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
      }
    }

    prevLogsLengthRef.current = currentLogsLength
  }, [task.logs])

  const copyLogsToClipboard = async () => {
    try {
      const logsText = (task.logs || []).map((log) => log.message).join('\n')

      await navigator.clipboard.writeText(logsText)
      setCopiedLogs(true)
      toast.success('Logs copied to clipboard!')
      setTimeout(() => setCopiedLogs(false), 2000)
    } catch {
      toast.error('Failed to copy logs to clipboard')
    }
  }

  if (!task.logs || task.logs.length === 0) {
    return null
  }

  return (
    <div 
      className="fixed bottom-0 right-0 z-10 border-t bg-background transition-all duration-300 ease-in-out"
      style={{
        left: isSidebarOpen ? 'calc(var(--sidebar-width) + 4px)' : '0px',
      }}
    >
      <div className="flex flex-col">
        <div className="border-b flex items-center justify-between">
          <div 
            className="flex items-center gap-1.5 py-1.5 px-3 flex-1 cursor-pointer hover:bg-accent/50"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div className="h-5 w-5 flex items-center justify-center">
              {isCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Logs</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyLogsToClipboard}
            className="h-5 w-5 p-0 hover:bg-accent mr-3"
            title="Copy logs to clipboard"
          >
            {copiedLogs ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        {!isCollapsed && (
          <div
            ref={logsContainerRef}
            className="bg-black text-green-400 p-2 font-mono text-xs h-48 overflow-y-auto leading-relaxed"
          >
              {(task.logs || []).map((log, index) => {
                const getLogColor = (logType: LogEntry['type']) => {
                  switch (logType) {
                    case 'command':
                      return 'text-gray-400'
                    case 'error':
                      return 'text-red-400'
                    case 'success':
                      return 'text-green-400'
                    case 'info':
                    default:
                      return 'text-white'
                  }
                }

                const formatTime = (timestamp: Date) => {
                  return new Date(timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 3,
                  })
                }

                return (
                  <div key={index} className={cn('flex gap-1.5 leading-tight', getLogColor(log.type))}>
                    <span className="text-gray-500 text-[10px] shrink-0 opacity-60">
                      [{formatTime(log.timestamp || new Date())}]
                    </span>
                    <span className="flex-1">{log.message}</span>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

