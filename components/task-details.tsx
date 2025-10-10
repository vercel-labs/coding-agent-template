'use client'

import { Task, LogEntry, Connector } from '@/lib/db/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ExternalLink, GitBranch, Clock, CheckCircle, AlertCircle, Loader2, Copy, Check, Server, FileText, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Claude, Codex, Cursor, OpenCode } from '@/components/logos'
import { useTasks } from '@/components/app-layout'
import { TaskDuration } from '@/components/task-duration'
import { FileBrowser } from '@/components/file-browser'
import { FileDiffViewer } from '@/components/file-diff-viewer'
import BrowserbaseIcon from '@/components/icons/browserbase-icon'
import Context7Icon from '@/components/icons/context7-icon'
import ConvexIcon from '@/components/icons/convex-icon'
import FigmaIcon from '@/components/icons/figma-icon'
import HuggingFaceIcon from '@/components/icons/huggingface-icon'
import LinearIcon from '@/components/icons/linear-icon'
import NotionIcon from '@/components/icons/notion-icon'
import PlaywrightIcon from '@/components/icons/playwright-icon'
import SupabaseIcon from '@/components/icons/supabase-icon'

interface TaskDetailsProps {
  task: Task
}

interface DiffData {
  filename: string
  oldContent: string
  newContent: string
  language: string
}

export function TaskDetails({ task }: TaskDetailsProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedLogs, setCopiedLogs] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<Task['status'] | null>(null)
  const [mcpServers, setMcpServers] = useState<Connector[]>([])
  const [loadingMcpServers, setLoadingMcpServers] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const [files, setFiles] = useState<string[]>([])
  const [diffsCache, setDiffsCache] = useState<Record<string, DiffData>>({})
  const [loadingDiffs, setLoadingDiffs] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef<number>(0)
  const hasInitialScrolled = useRef<boolean>(false)
  const { refreshTasks } = useTasks()

  // Helper function to format dates - show only time if same day as today
  const formatDateTime = (date: Date) => {
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()

    if (isToday) {
      return date.toLocaleTimeString()
    } else {
      return `${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`
    }
  }

  // Use optimistic status if available, otherwise use actual task status
  const currentStatus = optimisticStatus || task.status

  // Clear optimistic status when task status actually changes
  useEffect(() => {
    if (optimisticStatus && task.status === optimisticStatus) {
      setOptimisticStatus(null)
    }
  }, [task.status, optimisticStatus])

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

  // Model mappings for all agents
  const AGENT_MODELS: Record<string, Array<{ value: string; label: string }>> = {
    claude: [
      { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
      { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
      { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
    ],
    codex: [
      { value: 'openai/gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
      { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
      { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
      { value: 'gpt-5-pro', label: 'GPT-5 pro' },
      { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
    ],
    cursor: [
      { value: 'auto', label: 'Auto' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 nano' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
      { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
      { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
    ],
    gemini: [
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    opencode: [
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 nano' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
      { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
      { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
    ],
  }

  // Get readable model name
  const getModelName = (modelId: string | null, agent: string | null) => {
    if (!modelId || !agent) return modelId

    const agentModels = AGENT_MODELS[agent.toLowerCase()]
    if (!agentModels) return modelId

    const model = agentModels.find((m) => m.value === modelId)
    return model ? model.label : modelId
  }

  // Function to determine which icon to show for a connector
  const getConnectorIcon = (connector: Connector) => {
    const lowerName = connector.name.toLowerCase()
    const url = connector.baseUrl?.toLowerCase() || ''
    const cmd = connector.command?.toLowerCase() || ''

    // Check by name, URL, or command
    if (lowerName.includes('browserbase') || cmd.includes('browserbasehq') || cmd.includes('@browserbasehq/mcp')) {
      return <BrowserbaseIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('context7') || url.includes('context7.com')) {
      return <Context7Icon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('convex') || cmd.includes('convex') || url.includes('convex')) {
      return <ConvexIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('figma') || url.includes('figma.com')) {
      return <FigmaIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('hugging') || lowerName.includes('huggingface') || url.includes('hf.co')) {
      return <HuggingFaceIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('linear') || url.includes('linear.app')) {
      return <LinearIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('notion') || url.includes('notion.com')) {
      return <NotionIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('playwright') || cmd.includes('playwright') || cmd.includes('@playwright/mcp')) {
      return <PlaywrightIcon className="h-6 w-6 flex-shrink-0" />
    }
    if (lowerName.includes('supabase') || url.includes('supabase.com')) {
      return <SupabaseIcon className="h-6 w-6 flex-shrink-0" />
    }

    // Default icon
    return <Server className="h-6 w-6 flex-shrink-0 text-muted-foreground" />
  }

  // Fetch MCP servers if task has mcpServerIds (only when IDs actually change)
  useEffect(() => {
    async function fetchMcpServers() {
      if (!task.mcpServerIds || task.mcpServerIds.length === 0) {
        return
      }

      setLoadingMcpServers(true)

      try {
        const response = await fetch('/api/connectors')
        if (response.ok) {
          const result = await response.json()
          const taskMcpServers = result.data.filter((c: Connector) => task.mcpServerIds?.includes(c.id))
          setMcpServers(taskMcpServers)
        }
      } catch (error) {
        console.error('Failed to fetch MCP servers:', error)
      } finally {
        setLoadingMcpServers(false)
      }
    }

    fetchMcpServers()
    // Use JSON.stringify to create stable dependency - only re-run when IDs actually change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(task.mcpServerIds)])

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

  // Fetch all diffs when files list changes
  const fetchAllDiffs = async (filesList: string[]) => {
    if (!filesList.length || loadingDiffs) return

    setLoadingDiffs(true)
    const newDiffsCache: Record<string, DiffData> = {}

    try {
      // Fetch all diffs in parallel
      const diffPromises = filesList.map(async (filename) => {
        try {
          const params = new URLSearchParams()
          params.set('filename', filename)

          const response = await fetch(`/api/tasks/${task.id}/diff?${params.toString()}`)
          const result = await response.json()

          if (response.ok && result.success) {
            newDiffsCache[filename] = result.data
          }
        } catch (err) {
          console.error(`Error fetching diff for ${filename}:`, err)
        }
      })

      await Promise.all(diffPromises)
      setDiffsCache(newDiffsCache)
    } catch (error) {
      console.error('Error fetching diffs:', error)
    } finally {
      setLoadingDiffs(false)
    }
  }

  const copyPromptToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPrompt(true)
      toast.success('Prompt copied to clipboard!')
      setTimeout(() => setCopiedPrompt(false), 2000)
    } catch {
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
    } catch {
      toast.error('Failed to copy logs to clipboard')
    }
  }

  const handleStopTask = async () => {
    setIsStopping(true)
    // Optimistically update the status to 'stopped'
    setOptimisticStatus('stopped')

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'stop' }),
      })

      if (response.ok) {
        toast.success('Task stopped successfully!')
        refreshTasks() // Refresh the sidebar
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to stop task')
        // Revert optimistic update on error
        setOptimisticStatus(null)
      }
    } catch (error) {
      console.error('Error stopping task:', error)
      toast.error('Failed to stop task')
      // Revert optimistic update on error
      setOptimisticStatus(null)
    } finally {
      setIsStopping(false)
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
      case 'stopped':
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
      case 'stopped':
        return 'Stopped'
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
      case 'stopped':
        return 'text-orange-500'
      default:
        return 'text-gray-500'
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">
              <FileText className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="changes">
              <Code className="w-4 h-4" />
              Changes
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText className="w-4 h-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <Card>
              <CardContent className="space-y-4">
            {/* Status, Created, Completed, and Duration */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <h4 className="font-medium mb-1">Status</h4>
                <div className={cn('flex items-center gap-2 text-sm', getStatusColor(currentStatus))}>
                  {getStatusIcon(currentStatus)}
                  <span>{getStatusText(currentStatus)}</span>
                  {currentStatus === 'processing' && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleStopTask}
                      disabled={isStopping}
                      className="h-5 w-5 p-0 rounded-full"
                      title="Stop task"
                    >
                      <div className="h-2.5 w-2.5 bg-current" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-1">Created</h4>
                <p className="text-sm text-muted-foreground">{formatDateTime(new Date(task.createdAt))}</p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Completed</h4>
                <p className="text-sm text-muted-foreground">
                  {task.completedAt ? formatDateTime(new Date(task.completedAt)) : 'Not completed'}
                </p>
              </div>
              <TaskDuration task={task} />
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
                    <p className="text-sm text-muted-foreground truncate">
                      {getModelName(task.selectedModel, task.selectedAgent)}
                    </p>
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

            {task.mcpServerIds && task.mcpServerIds.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">MCP Servers</h4>
                {loadingMcpServers ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 w-32 bg-muted rounded-md animate-pulse" />
                    ))}
                  </div>
                ) : mcpServers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {mcpServers.map((server) => (
                      <div key={server.id} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm">
                        {getConnectorIcon(server)}
                        <span>{server.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No MCP servers found</p>
                )}
              </div>
            )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Changes Tab */}
          <TabsContent value="changes">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* File Browser */}
              <Card className="lg:col-span-1">
                <FileBrowser
                  taskId={task.id}
                  branchName={task.branchName}
                  onFileSelect={setSelectedFile}
                  onFilesLoaded={fetchAllDiffs}
                  selectedFile={selectedFile}
                />
              </Card>

              {/* Diff Viewer */}
              <Card className="lg:col-span-2">
                <CardContent className="p-4">
                  {loadingDiffs ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">Loading all diffs...</p>
                      </div>
                    </div>
                  ) : (
                    <FileDiffViewer selectedFile={selectedFile} diffsCache={diffsCache} />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            {task.logs && task.logs.length > 0 ? (
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
                          <span className="text-gray-500 text-xs shrink-0 mt-0.5">
                            [{formatTime(log.timestamp || new Date())}]
                          </span>
                          <span className="flex-1">{log.message}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">No logs available yet</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
