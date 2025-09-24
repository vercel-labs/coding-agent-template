'use client'

import { Task, LogEntry } from '@/lib/db/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, GitBranch, Clock, CheckCircle, AlertCircle, Loader2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Claude, Codex, Cursor, OpenCode } from '@/components/logos'

interface TaskDetailsProps {
  task: Task
}

export function TaskDetails({ task }: TaskDetailsProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedLogs, setCopiedLogs] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef<number>(0)
  const hasInitialScrolled = useRef<boolean>(false)

  const getAgentLogo = (agent: string | null) => {
    if (!agent) return null

    switch (agent.toLowerCase()) {
      case 'claude':
        return Claude
      case 'codex':
        return Codex
      case 'cursor':
        return Cursor
      case 'opencode':
        return OpenCode
      default:
        return null
    }
  }

  // Scroll to bottom on initial load
  useEffect(() => {
    if (task.logs && task.logs.length > 0 && !hasInitialScrolled.current && logsContainerRef.current) {
      // Use setTimeout to ensure the DOM is fully rendered
      setTimeout(() => {
        if (logsContainerRef.current) {
          logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
          hasInitialScrolled.current = true
        }
      }, 100)
    }
  }, [task.logs])

  // Auto-scroll to bottom when new logs are added (after initial load)
  useEffect(() => {
    const currentLogsLength = task.logs?.length || 0

    // Only scroll if new logs were added (not on initial load)
    if (currentLogsLength > prevLogsLengthRef.current && prevLogsLengthRef.current > 0) {
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
      }
    }

    // Update the previous logs length
    prevLogsLengthRef.current = currentLogsLength
  }, [task.logs])

  const copyPromptToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPrompt(true)
      toast.success('Prompt copied to clipboard!')
      setTimeout(() => setCopiedPrompt(false), 2000)
    } catch (err) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const copyLogsToClipboard = async () => {
    try {
      const logsText = (task.logs || []).map((log) => log.message).join('\n')

      await navigator.clipboard.writeText(logsText)
      setCopiedLogs(true)
      toast.success('Logs copied to clipboard!')
      setTimeout(() => setCopiedLogs(false), 2000)
    } catch (err) {
      toast.error('Failed to copy logs to clipboard')
    }
  }

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4" />
      case 'error':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusText = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return 'Waiting to start'
      case 'processing':
        return 'In progress'
      case 'completed':
        return 'Completed'
      case 'error':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return 'text-gray-500'
      case 'processing':
        return 'text-blue-500'
      case 'completed':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Task Details */}
        <Card>
          <CardContent className="space-y-4">
            {/* Status, Created, Completed, and Duration */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <h4 className="font-medium mb-1">Status</h4>
                <div className={cn('flex items-center gap-2 text-sm', getStatusColor(task.status))}>
                  {getStatusIcon(task.status)}
                  <span>{getStatusText(task.status)}</span>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-1">Created</h4>
                <p className="text-sm text-muted-foreground">
                  {new Date(task.createdAt).toLocaleDateString()} at {new Date(task.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Completed</h4>
                <p className="text-sm text-muted-foreground">
                  {task.completedAt
                    ? `${new Date(task.completedAt).toLocaleDateString()} at ${new Date(task.completedAt).toLocaleTimeString()}`
                    : 'Not completed'}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Duration</h4>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const startTime = new Date(task.createdAt).getTime()
                    const endTime = task.completedAt ? new Date(task.completedAt).getTime() : Date.now()
                    const durationMs = endTime - startTime
                    const durationSeconds = Math.floor(durationMs / 1000)
                    const minutes = Math.floor(durationSeconds / 60)
                    const seconds = durationSeconds % 60

                    if (minutes > 0) {
                      return `${minutes}m ${seconds}s`
                    } else {
                      return `${seconds}s`
                    }
                  })()}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Prompt</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyPromptToClipboard(task.prompt)}
                  className="h-8 w-8 p-0"
                  title="Copy prompt to clipboard"
                >
                  {copiedPrompt ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm bg-muted p-3 rounded-md">{task.prompt}</p>
            </div>

            {(task.selectedAgent || task.selectedModel) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {task.selectedAgent && (
                  <div className="min-w-0">
                    <h4 className="font-medium mb-2">Agent</h4>
                    <div className="flex items-center gap-2 text-sm">
                      {(() => {
                        const AgentLogo = getAgentLogo(task.selectedAgent)
                        return AgentLogo ? <AgentLogo className="w-4 h-4 flex-shrink-0" /> : null
                      })()}
                      <span className="capitalize truncate">{task.selectedAgent}</span>
                    </div>
                  </div>
                )}

                {task.selectedModel && (
                  <div className="min-w-0">
                    <h4 className="font-medium mb-2">Model</h4>
                    <p className="text-sm text-muted-foreground truncate">{task.selectedModel}</p>
                  </div>
                )}
              </div>
            )}

            {(task.repoUrl || task.branchName) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {task.repoUrl && (
                  <div className="min-w-0">
                    <h4 className="font-medium mb-2">Repo</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <a
                        href={task.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground truncate"
                      >
                        {task.repoUrl.replace('https://github.com/', '').replace('.git', '')}
                      </a>
                    </div>
                  </div>
                )}

                {task.branchName && (
                  <div className="min-w-0">
                    <h4 className="font-medium mb-2">Branch</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <GitBranch className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      {task.repoUrl ? (
                        <a
                          href={`${task.repoUrl.replace('.git', '')}/tree/${task.branchName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground truncate"
                        >
                          {task.branchName}
                        </a>
                      ) : (
                        <span className="text-muted-foreground truncate">{task.branchName}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logs */}
        {task.logs && task.logs.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Execution Logs</CardTitle>
                  <CardDescription>Detailed logs from the task execution</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLogsToClipboard}
                  className="h-8 w-8 p-0"
                  title="Copy logs to clipboard"
                >
                  {copiedLogs ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div
                ref={logsContainerRef}
                className="bg-black text-green-400 p-4 rounded-md font-mono text-sm max-h-96 overflow-y-auto"
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
                    <div key={index} className={cn('mb-1 flex gap-2', getLogColor(log.type))}>
                      <span className="text-gray-500 text-xs shrink-0 mt-0.5">[{formatTime(log.timestamp ?? new Date())}]</span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
