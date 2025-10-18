'use client'

import { Task, LogEntry } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Copy, Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTasks } from '@/components/app-layout'
import { getLogsPaneHeight, setLogsPaneHeight, getLogsPaneCollapsed, setLogsPaneCollapsed } from '@/lib/utils/cookies'
import { Terminal, TerminalRef } from '@/components/terminal'

interface LogsPaneProps {
  task: Task
  onHeightChange?: (height: number) => void
}

type TabType = 'logs' | 'terminal' | 'client' | 'server'

export function LogsPane({ task, onHeightChange }: LogsPaneProps) {
  const [copiedLogs, setCopiedLogs] = useState(false)
  const [copiedTerminal, setCopiedTerminal] = useState(false)
  const [copiedClient, setCopiedClient] = useState(false)
  const [copiedServer, setCopiedServer] = useState(false)
  const [isCollapsed, setIsCollapsedState] = useState(true)
  const [paneHeight, setPaneHeight] = useState(200)
  const [isResizing, setIsResizing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('logs')
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const clientLogsContainerRef = useRef<HTMLDivElement>(null)
  const serverLogsContainerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<TerminalRef>(null)
  const prevLogsLengthRef = useRef<number>(0)
  const prevClientLogsLengthRef = useRef<number>(0)
  const prevServerLogsLengthRef = useRef<number>(0)
  const hasInitialScrolled = useRef<boolean>(false)
  const { isSidebarOpen, isSidebarResizing, refreshTasks } = useTasks()

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

  // Auto-scroll to bottom when new client logs are added
  useEffect(() => {
    const currentLogsLength = task.clientLogs?.length || 0

    if (currentLogsLength > prevClientLogsLengthRef.current && prevClientLogsLengthRef.current > 0) {
      if (clientLogsContainerRef.current) {
        clientLogsContainerRef.current.scrollTop = clientLogsContainerRef.current.scrollHeight
      }
    }

    prevClientLogsLengthRef.current = currentLogsLength
  }, [task.clientLogs])

  // Auto-scroll to bottom when new server logs are added
  useEffect(() => {
    const currentLogsLength = task.serverLogs?.length || 0

    if (currentLogsLength > prevServerLogsLengthRef.current && prevServerLogsLengthRef.current > 0) {
      if (serverLogsContainerRef.current) {
        serverLogsContainerRef.current.scrollTop = serverLogsContainerRef.current.scrollHeight
      }
    }

    prevServerLogsLengthRef.current = currentLogsLength
  }, [task.serverLogs])

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

  const clearLogs = async () => {
    if (isClearingLogs) return

    setIsClearingLogs(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/clear-logs`, {
        method: 'POST',
      })

      if (response.ok) {
        refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to clear logs')
      }
    } catch (error) {
      console.error('Error clearing logs:', error)
      toast.error('Failed to clear logs')
    } finally {
      setIsClearingLogs(false)
    }
  }

  const clearTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.clear()
    }
  }

  const copyTerminalToClipboard = async () => {
    if (terminalRef.current) {
      try {
        const terminalText = terminalRef.current.getTerminalText()
        await navigator.clipboard.writeText(terminalText)
        setCopiedTerminal(true)
        setTimeout(() => setCopiedTerminal(false), 2000)
      } catch {
        toast.error('Failed to copy terminal to clipboard')
      }
    }
  }

  const clearClientLogs = async () => {
    if (isClearingLogs) return

    setIsClearingLogs(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/clear-client-logs`, {
        method: 'POST',
      })

      if (response.ok) {
        refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to clear client logs')
      }
    } catch (error) {
      console.error('Error clearing client logs:', error)
      toast.error('Failed to clear client logs')
    } finally {
      setIsClearingLogs(false)
    }
  }

  const clearServerLogs = async () => {
    if (isClearingLogs) return

    setIsClearingLogs(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/clear-server-logs`, {
        method: 'POST',
      })

      if (response.ok) {
        refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to clear server logs')
      }
    } catch (error) {
      console.error('Error clearing server logs:', error)
      toast.error('Failed to clear server logs')
    } finally {
      setIsClearingLogs(false)
    }
  }

  const copyClientLogsToClipboard = async () => {
    try {
      const logsText = (task.clientLogs || []).map((log) => log.message).join('\n')

      await navigator.clipboard.writeText(logsText)
      setCopiedClient(true)
      setTimeout(() => setCopiedClient(false), 2000)
    } catch {
      toast.error('Failed to copy client logs to clipboard')
    }
  }

  const copyServerLogsToClipboard = async () => {
    try {
      const logsText = (task.serverLogs || []).map((log) => log.message).join('\n')

      await navigator.clipboard.writeText(logsText)
      setCopiedServer(true)
      setTimeout(() => setCopiedServer(false), 2000)
    } catch {
      toast.error('Failed to copy server logs to clipboard')
    }
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
        <div
          className="border-b flex items-center justify-between flex-shrink-0 hover:bg-accent/50 cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-1.5 py-1.5 px-3 flex-1">
            <div className="h-5 w-5 flex items-center justify-center">
              {isCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isCollapsed) {
                    setIsCollapsed(false)
                  }
                  setActiveTab('logs')
                }}
                className={cn(
                  'text-xs font-medium uppercase tracking-wide transition-colors px-2 py-1 rounded',
                  activeTab === 'logs'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                Logs
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isCollapsed) {
                    setIsCollapsed(false)
                  }
                  setActiveTab('terminal')
                }}
                className={cn(
                  'text-xs font-medium uppercase tracking-wide transition-colors px-2 py-1 rounded',
                  activeTab === 'terminal'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                Terminal
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isCollapsed) {
                    setIsCollapsed(false)
                  }
                  setActiveTab('client')
                }}
                className={cn(
                  'text-xs font-medium uppercase tracking-wide transition-colors px-2 py-1 rounded',
                  activeTab === 'client'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                Client
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isCollapsed) {
                    setIsCollapsed(false)
                  }
                  setActiveTab('server')
                }}
                className={cn(
                  'text-xs font-medium uppercase tracking-wide transition-colors px-2 py-1 rounded',
                  activeTab === 'server'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                Server
              </button>
            </div>
          </div>
          {activeTab === 'logs' && (
            <div className="flex items-center gap-1 mr-3" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearLogs}
                disabled={isClearingLogs}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Clear logs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyLogsToClipboard}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Copy logs to clipboard"
              >
                {copiedLogs ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
          {activeTab === 'terminal' && (
            <div className="flex items-center gap-1 mr-3" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearTerminal}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Clear terminal"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyTerminalToClipboard}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Copy terminal to clipboard"
              >
                {copiedTerminal ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
          {activeTab === 'client' && (
            <div className="flex items-center gap-1 mr-3" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearClientLogs}
                disabled={isClearingLogs}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Clear client logs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyClientLogsToClipboard}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Copy client logs to clipboard"
              >
                {copiedClient ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
          {activeTab === 'server' && (
            <div className="flex items-center gap-1 mr-3" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearServerLogs}
                disabled={isClearingLogs}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Clear server logs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyServerLogsToClipboard}
                className="h-5 w-5 p-0 hover:bg-accent"
                title="Copy server logs to clipboard"
              >
                {copiedServer ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
        <div
          ref={logsContainerRef}
          className={cn(
            'bg-black text-green-400 p-2 font-mono text-xs flex-1 overflow-y-auto leading-relaxed',
            (isCollapsed || activeTab !== 'logs') && 'hidden',
          )}
        >
          {(task.logs || []).map((log, index) => {
            const getLogColor = (logType: LogEntry['type']) => {
              switch (logType) {
                case 'command':
                  return 'text-cyan-400'
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
                <span className="text-white/40 text-[10px] shrink-0">[{formatTime(log.timestamp || new Date())}]</span>
                <span className="flex-1">{log.message}</span>
              </div>
            )
          })}
        </div>
        <div className={cn('flex-1 overflow-hidden', (isCollapsed || activeTab !== 'terminal') && 'hidden')}>
          <Terminal
            ref={terminalRef}
            taskId={task.id}
            isActive={activeTab === 'terminal' && !isCollapsed}
            isMobile={!isDesktop}
          />
        </div>
        <div
          ref={clientLogsContainerRef}
          className={cn(
            'bg-black text-green-400 p-2 font-mono text-xs flex-1 overflow-y-auto leading-relaxed',
            (isCollapsed || activeTab !== 'client') && 'hidden',
          )}
        >
          {(task.clientLogs || []).map((log, index) => {
            const getLogColor = (logType: LogEntry['type']) => {
              switch (logType) {
                case 'command':
                  return 'text-cyan-400'
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
                <span className="text-white/40 text-[10px] shrink-0">[{formatTime(log.timestamp || new Date())}]</span>
                <span className="flex-1">{log.message}</span>
              </div>
            )
          })}
        </div>
        <div
          ref={serverLogsContainerRef}
          className={cn(
            'bg-black text-green-400 p-2 font-mono text-xs flex-1 overflow-y-auto leading-relaxed',
            (isCollapsed || activeTab !== 'server') && 'hidden',
          )}
        >
          {(task.serverLogs || []).map((log, index) => {
            const getLogColor = (logType: LogEntry['type']) => {
              switch (logType) {
                case 'command':
                  return 'text-cyan-400'
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
                <span className="text-white/40 text-[10px] shrink-0">[{formatTime(log.timestamp || new Date())}]</span>
                <span className="flex-1">{log.message}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
