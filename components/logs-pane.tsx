'use client'

import { Task, LogEntry } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTasks } from '@/components/app-layout'
import { getLogsPaneHeight, setLogsPaneHeight, getLogsPaneCollapsed, setLogsPaneCollapsed } from '@/lib/utils/cookies'

interface LogsPaneProps {
  task: Task
  onHeightChange?: (height: number) => void
}

export function LogsPane({ task, onHeightChange }: LogsPaneProps) {
  const [copiedLogs, setCopiedLogs] = useState(false)
  const [isCollapsed, setIsCollapsedState] = useState(true)
  const [paneHeight, setPaneHeight] = useState(200)
  const [isResizing, setIsResizing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef<number>(0)
  const hasInitialScrolled = useRef<boolean>(false)
  const { isSidebarOpen, isSidebarResizing } = useTasks()

  // Check if we're on desktop
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }

    checkDesktop()

    // Delay enabling transitions until after the browser has painted the correct position
    requestAnimationFrame(() => {
      setHasMounted(true)
    })

    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  // Initialize height and collapsed state from cookies on mount
  useEffect(() => {
    const savedHeight = getLogsPaneHeight()
    const savedCollapsed = getLogsPaneCollapsed()
    setPaneHeight(savedHeight)
    setIsCollapsedState(savedCollapsed)
    // Notify parent of initial height
    onHeightChange?.(savedCollapsed ? 40 : savedHeight)
  }, [onHeightChange])

  // Wrapper to update both state and cookie
  const setIsCollapsed = (collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    setLogsPaneCollapsed(collapsed)
    // Notify parent of height change (collapsed = ~40px, expanded = paneHeight)
    onHeightChange?.(collapsed ? 40 : paneHeight)
  }

  // Notify parent when paneHeight changes
  useEffect(() => {
    if (!isCollapsed) {
      onHeightChange?.(paneHeight)
    }
  }, [paneHeight, isCollapsed, onHeightChange])

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      // Calculate new height (resize from top, so subtract from window height)
      const newHeight = window.innerHeight - e.clientY
      const minHeight = 100
      const maxHeight = 600

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setPaneHeight(newHeight)
        setLogsPaneHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

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
      setTimeout(() => setCopiedLogs(false), 2000)
    } catch {
      toast.error('Failed to copy logs to clipboard')
    }
  }

  if (!task.logs || task.logs.length === 0) {
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  return (
    <div
      className={`fixed bottom-0 right-0 z-10 bg-background ${isResizing || isSidebarResizing || !hasMounted ? '' : 'transition-all duration-300 ease-in-out'}`}
      style={{
        left: isDesktop && isSidebarOpen ? 'var(--sidebar-width)' : '0px',
        height: isCollapsed ? 'auto' : `${paneHeight}px`,
      }}
    >
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className={`absolute top-0 left-0 right-0 h-1 cursor-row-resize group hover:bg-primary/20 ${isResizing ? '' : 'transition-colors'}`}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-x-0 top-0 h-2 -mt-0.5" />
          <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      <div className="flex flex-col h-full border-t">
        <div className="border-b flex items-center justify-between flex-shrink-0 hover:bg-accent/50">
          <div
            className="flex items-center gap-1.5 py-1.5 px-3 flex-1 cursor-pointer"
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
            className="bg-black text-green-400 p-2 font-mono text-xs flex-1 overflow-y-auto leading-relaxed"
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
