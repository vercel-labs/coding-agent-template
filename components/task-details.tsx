'use client'

import { Task, LogEntry, Connector } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GitBranch, CheckCircle, AlertCircle, Loader2, Copy, Check, Server, Cable } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Claude, Codex, Cursor, Gemini, OpenCode } from '@/components/logos'
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
  const [isStopping, setIsStopping] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<Task['status'] | null>(null)
  const [mcpServers, setMcpServers] = useState<Connector[]>([])
  const [loadingMcpServers, setLoadingMcpServers] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const [diffsCache, setDiffsCache] = useState<Record<string, DiffData>>({})
  const [loadingDiffs, setLoadingDiffs] = useState(false)
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
      case 'gemini':
        return Gemini
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
        return <AlertCircle className="h-4 w-4" />
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4" />
      case 'error':
        return <AlertCircle className="h-4 w-4" />
      case 'stopped':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
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
    <div className="flex flex-col flex-1 min-h-0">
      {/* Overview Section */}
      <div className="space-y-3 pb-6 border-b px-6 flex-shrink-0">
        {/* Prompt */}
        <div className="flex items-center gap-2">
          <p className="text-2xl flex-1 truncate">{task.prompt}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyPromptToClipboard(task.prompt)}
            className="h-8 w-8 p-0 flex-shrink-0"
            title="Copy prompt to clipboard"
          >
            {copiedPrompt ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {/* Compact info row */}
        <div className="flex items-center gap-4 flex-wrap text-sm">
          {/* Status + Duration */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn('flex items-center gap-2 cursor-help', getStatusColor(currentStatus))}>
                  {getStatusIcon(currentStatus)}
                  <span className="text-muted-foreground">
                    <TaskDuration task={task} hideTitle={true} />
                  </span>
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
              </TooltipTrigger>
              <TooltipContent side="bottom" className="space-y-1">
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  <span className="text-muted-foreground">{formatDateTime(new Date(task.createdAt))}</span>
                </div>
                <div>
                  <span className="font-medium">Completed:</span>{' '}
                  <span className="text-muted-foreground">
                    {task.completedAt ? formatDateTime(new Date(task.completedAt)) : 'Not completed'}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Repo */}
          {task.repoUrl && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              <a
                href={task.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground truncate"
              >
                {task.repoUrl.replace('https://github.com/', '').replace('.git', '')}
              </a>
            </div>
          )}

          {/* Branch */}
          {task.branchName && (
            <div className="flex items-center gap-2">
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
          )}

          {/* Agent */}
          {(task.selectedAgent || task.selectedModel) && (
            <div className="flex items-center gap-2">
              {task.selectedAgent &&
                (() => {
                  const AgentLogo = getAgentLogo(task.selectedAgent)
                  return AgentLogo ? <AgentLogo className="w-4 h-4 flex-shrink-0" /> : null
                })()}
              {task.selectedModel && (
                <span className="text-muted-foreground">{getModelName(task.selectedModel, task.selectedAgent)}</span>
              )}
            </div>
          )}

          {/* MCP Servers */}
          {!loadingMcpServers && mcpServers.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-help text-muted-foreground">
                    <Cable className="h-4 w-4 flex-shrink-0" />
                    <span>
                      {mcpServers.length} MCP Server{mcpServers.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    {mcpServers.map((server) => (
                      <div key={server.id} className="flex items-center gap-1.5">
                        {getConnectorIcon(server)}
                        <span>{server.name}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Changes Section */}
      {task.branchName ? (
        <div className="flex-1 flex gap-6 px-6 pt-6 pb-6 min-h-0 overflow-hidden">
          {/* File Browser */}
          <div className="w-1/3 overflow-y-auto min-h-0">
            <FileBrowser
              taskId={task.id}
              branchName={task.branchName}
              onFileSelect={setSelectedFile}
              onFilesLoaded={fetchAllDiffs}
              selectedFile={selectedFile}
            />
          </div>

          {/* Diff Viewer */}
          <div className="flex-1 min-h-0 bg-card rounded-md border overflow-hidden">
            <div className="overflow-y-auto h-full">
              {loadingDiffs ? (
                <div className="h-full w-full animate-pulse bg-muted/50" />
              ) : (
                <FileDiffViewer
                  selectedFile={selectedFile}
                  diffsCache={diffsCache}
                  isInitialLoading={Object.keys(diffsCache).length === 0}
                />
              )}
            </div>
          </div>
        </div>
      ) : currentStatus === 'pending' || currentStatus === 'processing' ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Working...</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
