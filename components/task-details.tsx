'use client'

import { Task, Connector } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  GitBranch,
  CheckCircle,
  AlertCircle,
  Loader2,
  Server,
  Cable,
  Square,
  GitPullRequest,
  RotateCcw,
  Trash2,
  ChevronDown,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Claude, Codex, Cursor, Gemini, OpenCode } from '@/components/logos'
import { useTasks } from '@/components/app-layout'
import { FileBrowser } from '@/components/file-browser'
import { FileDiffViewer } from '@/components/file-diff-viewer'
import { CreatePRDialog } from '@/components/create-pr-dialog'
import { MergePRDialog } from '@/components/merge-pr-dialog'
import { TaskChat } from '@/components/task-chat'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import BrowserbaseIcon from '@/components/icons/browserbase-icon'
import Context7Icon from '@/components/icons/context7-icon'
import ConvexIcon from '@/components/icons/convex-icon'
import FigmaIcon from '@/components/icons/figma-icon'
import HuggingFaceIcon from '@/components/icons/huggingface-icon'
import LinearIcon from '@/components/icons/linear-icon'
import NotionIcon from '@/components/icons/notion-icon'
import PlaywrightIcon from '@/components/icons/playwright-icon'
import SupabaseIcon from '@/components/icons/supabase-icon'
import VercelIcon from '@/components/icons/vercel-icon'

interface TaskDetailsProps {
  task: Task
}

interface DiffData {
  filename: string
  oldContent: string
  newContent: string
  language: string
}

const CODING_AGENTS = [
  { value: 'claude', label: 'Claude', icon: Claude },
  { value: 'codex', label: 'Codex', icon: Codex },
  { value: 'cursor', label: 'Cursor', icon: Cursor },
  { value: 'gemini', label: 'Gemini', icon: Gemini },
  { value: 'opencode', label: 'opencode', icon: OpenCode },
] as const

const AGENT_MODELS = {
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
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'opus-4.1', label: 'Opus 4.1' },
    { value: 'grok', label: 'Grok' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  opencode: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
  ],
} as const

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  codex: 'openai/gpt-5',
  cursor: 'auto',
  gemini: 'gemini-2.5-pro',
  opencode: 'gpt-5',
} as const

export function TaskDetails({ task }: TaskDetailsProps) {
  const [isStopping, setIsStopping] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<Task['status'] | null>(null)
  const [mcpServers, setMcpServers] = useState<Connector[]>([])
  const [loadingMcpServers, setLoadingMcpServers] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const [diffsCache, setDiffsCache] = useState<Record<string, DiffData>>({})
  const loadingDiffsRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const previousStatusRef = useRef<Task['status']>(task.status)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTryAgainDialog, setShowTryAgainDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTryingAgain, setIsTryingAgain] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(task.selectedAgent || 'claude')
  const [selectedModel, setSelectedModel] = useState<string>(task.selectedModel || DEFAULT_MODELS.claude)
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(task.previewUrl || null)
  const [loadingDeployment, setLoadingDeployment] = useState(false)
  const [showPRDialog, setShowPRDialog] = useState(false)
  const [showMergePRDialog, setShowMergePRDialog] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(task.prUrl || null)
  const [prNumber, setPrNumber] = useState<number | null>(task.prNumber || null)
  const [prStatus, setPrStatus] = useState<'open' | 'closed' | 'merged' | null>(task.prStatus || null)
  const [isClosingPR, setIsClosingPR] = useState(false)
  const [isReopeningPR, setIsReopeningPR] = useState(false)
  const [isMergingPR, setIsMergingPR] = useState(false)
  const [viewMode, setViewMode] = useState<'changes' | 'all'>('changes')
  const { refreshTasks } = useTasks()
  const router = useRouter()

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
      { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
      { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
      { value: 'opus-4.1', label: 'Opus 4.1' },
      { value: 'grok', label: 'Grok' },
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

  // Fetch deployment info when task is completed and has a branch (only if not already cached)
  useEffect(() => {
    async function fetchDeployment() {
      // Skip if we already have a preview URL or task isn't ready
      if (deploymentUrl || currentStatus !== 'completed' || !task.branchName) {
        return
      }

      setLoadingDeployment(true)

      try {
        const response = await fetch(`/api/tasks/${task.id}/deployment`)
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data.hasDeployment && result.data.previewUrl) {
            setDeploymentUrl(result.data.previewUrl)
          }
        }
      } catch (error) {
        console.error('Failed to fetch deployment info:', error)
      } finally {
        setLoadingDeployment(false)
      }
    }

    fetchDeployment()
  }, [task.id, task.branchName, currentStatus, deploymentUrl])

  // Update deploymentUrl when task.previewUrl changes
  useEffect(() => {
    if (task.previewUrl && task.previewUrl !== deploymentUrl) {
      setDeploymentUrl(task.previewUrl)
    }
  }, [task.previewUrl, deploymentUrl])

  // Update prUrl, prNumber, and prStatus when task values change
  useEffect(() => {
    if (task.prUrl && task.prUrl !== prUrl) {
      console.log('[Update] prUrl changed:', task.prUrl)
      setPrUrl(task.prUrl)
    }
    if (task.prNumber && task.prNumber !== prNumber) {
      console.log('[Update] prNumber changed:', task.prNumber)
      setPrNumber(task.prNumber)
    }
    if (task.prStatus && task.prStatus !== prStatus) {
      console.log('[Update] prStatus changing from', prStatus, 'to', task.prStatus)
      setPrStatus(task.prStatus as 'open' | 'closed' | 'merged')
    }
  }, [task.prUrl, task.prNumber, task.prStatus, prUrl, prNumber, prStatus])

  // Clear loading states when PR status changes to expected value
  useEffect(() => {
    console.log(
      '[Clear] Check - prStatus:',
      prStatus,
      'isClosingPR:',
      isClosingPR,
      'isReopeningPR:',
      isReopeningPR,
      'isMergingPR:',
      isMergingPR,
    )

    if (prStatus === 'closed' && isClosingPR) {
      console.log('[Clear] Clearing isClosingPR and showing toast')
      setIsClosingPR(false)
      toast.success('Pull request closed successfully!')
    }
    if (prStatus === 'open' && isReopeningPR) {
      console.log('[Clear] Clearing isReopeningPR and showing toast')
      setIsReopeningPR(false)
      toast.success('Pull request reopened successfully!')
    }
    if (prStatus === 'merged' && isMergingPR) {
      console.log('[Clear] Clearing isMergingPR and showing toast')
      setIsMergingPR(false)
      toast.success('Pull request merged successfully!')
    }
  }, [prStatus, isClosingPR, isReopeningPR, isMergingPR])

  // Clear merge loading state if dialog closes without merging
  useEffect(() => {
    if (!showMergePRDialog && isMergingPR && prStatus !== 'merged') {
      setIsMergingPR(false)
    }
  }, [showMergePRDialog, isMergingPR, prStatus])

  // Sync PR status from GitHub when task has a PR
  useEffect(() => {
    async function syncPRStatus() {
      if (!task.prUrl || !task.prNumber || !task.repoUrl) {
        return
      }

      // Sync if status is 'open' (could have been merged/closed) OR if status is not set
      if (task.prStatus === 'open' || !task.prStatus) {
        try {
          const response = await fetch(`/api/tasks/${task.id}/sync-pr`, {
            method: 'POST',
          })
          const result = await response.json()

          if (response.ok && result.success && result.data.status) {
            // Update local state if status changed
            if (result.data.status !== prStatus) {
              setPrStatus(result.data.status)
              refreshTasks()
            }
          }
        } catch (error) {
          // Silently fail - not critical if sync doesn't work
          console.error('Failed to sync PR status:', error)
        }
      }
    }

    syncPRStatus()
    // Only run on mount and when prNumber changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.prNumber])

  // Fetch all diffs when files list changes
  const fetchAllDiffs = useCallback(
    async (filesList: string[]) => {
      if (!filesList.length || loadingDiffsRef.current) return

      loadingDiffsRef.current = true
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
            console.error('Error fetching diff for file:', err)
          }
        })

        await Promise.all(diffPromises)
        setDiffsCache(newDiffsCache)
      } catch (error) {
        console.error('Error fetching diffs:', error)
      } finally {
        loadingDiffsRef.current = false
      }
    },
    [task.id],
  )

  // Trigger refresh when task completes
  useEffect(() => {
    const currentStatus = optimisticStatus || task.status
    const previousStatus = previousStatusRef.current

    // If task transitions from processing/pending to completed/error/stopped, trigger refresh
    if (
      (previousStatus === 'processing' || previousStatus === 'pending') &&
      (currentStatus === 'completed' || currentStatus === 'error' || currentStatus === 'stopped')
    ) {
      setRefreshKey((prev) => prev + 1)
      // Clear diffs cache to force reload
      setDiffsCache({})
      setSelectedFile(undefined)
    }

    previousStatusRef.current = currentStatus
  }, [task.status, optimisticStatus])

  // Update model when agent changes
  useEffect(() => {
    if (selectedAgent) {
      const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
      const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
      if (defaultModel && agentModels) {
        setSelectedModel(defaultModel)
      }
    }
  }, [selectedAgent])

  const handleOpenPR = () => {
    if (prUrl) {
      // If PR already exists, show merge dialog
      handleOpenMergeDialog()
    } else {
      // Otherwise, show the create PR dialog
      setShowPRDialog(true)
    }
  }

  const handlePRCreated = (newPrUrl: string, newPrNumber: number) => {
    setPrUrl(newPrUrl)
    setPrNumber(newPrNumber)
    setPrStatus('open')
    refreshTasks()
  }

  const handlePRMerged = () => {
    console.log('[Merge] PR merged successfully')
    // Don't update prStatus here - let it come from task refresh
    refreshTasks()
    // Keep loading state - will be cleared by useEffect when status changes
  }

  const handleOpenMergeDialog = () => {
    // Don't set loading state yet - wait for user confirmation
    setShowMergePRDialog(true)
  }

  const handleMergeDialogClose = (open: boolean) => {
    setShowMergePRDialog(open)
    if (!open && !isMergingPR) {
      // Dialog closed without merging
      console.log('[Merge] Dialog closed without merge')
    }
  }

  const handleMergeInitiated = () => {
    // User confirmed merge - now show loading state
    console.log('[Merge] User confirmed merge - setting loading state')
    setIsMergingPR(true)
  }

  const handleReopenPR = async () => {
    if (!prNumber || !task.repoUrl || isReopeningPR) return

    setIsReopeningPR(true)
    console.log('[Reopen] Starting reopen - isReopeningPR:', true, 'prStatus:', prStatus)
    try {
      const response = await fetch(`/api/tasks/${task.id}/reopen-pr`, {
        method: 'POST',
      })

      if (response.ok) {
        console.log('[Reopen] API success - keeping loading state active')
        // Don't show toast yet - wait for UI to update
        await refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to reopen pull request')
        setIsReopeningPR(false)
      }
    } catch (error) {
      console.error('Error reopening pull request:', error)
      toast.error('Failed to reopen pull request')
      setIsReopeningPR(false)
    }
  }

  const handleClosePR = async () => {
    if (!prNumber || !task.repoUrl || isClosingPR) return

    setIsClosingPR(true)
    console.log('[Close] Starting close - isClosingPR:', true, 'prStatus:', prStatus)
    try {
      const response = await fetch(`/api/tasks/${task.id}/close-pr`, {
        method: 'POST',
      })

      if (response.ok) {
        console.log('[Close] API success - keeping loading state active')
        // Don't show toast yet - wait for UI to update
        await refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to close pull request')
        setIsClosingPR(false)
      }
    } catch (error) {
      console.error('Error closing pull request:', error)
      toast.error('Failed to close pull request')
      setIsClosingPR(false)
    }
  }

  const handleTryAgain = async () => {
    setIsTryingAgain(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: task.prompt,
          repoUrl: task.repoUrl,
          selectedAgent,
          selectedModel,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        toast.success('New task created successfully!')
        setShowTryAgainDialog(false)
        router.push(`/tasks/${result.task.id}`)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create new task')
      }
    } catch (error) {
      console.error('Error creating new task:', error)
      toast.error('Failed to create new task')
    } finally {
      setIsTryingAgain(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Task deleted successfully!')
        refreshTasks() // Refresh the sidebar
        router.push('/')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete task')
      }
    } catch (error) {
      console.error('Error deleting task:', error)
      toast.error('Failed to delete task')
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
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
      <div className="space-y-2 md:space-y-3 pb-3 md:pb-6 border-b pl-3 md:pl-6 pr-3 flex-shrink-0">
        {/* Prompt */}
        <div className="flex items-center gap-2">
          <p className="text-lg md:text-2xl flex-1 truncate">{task.prompt}</p>
          {currentStatus === 'processing' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStopTask}
              disabled={isStopping}
              className="h-7 w-7 md:h-8 md:w-8 p-0 flex-shrink-0"
              title="Stop task"
            >
              <Square className="h-3.5 w-3.5 md:h-4 md:w-4" fill="currentColor" />
            </Button>
          )}
          {currentStatus === 'completed' && task.repoUrl && task.branchName && (
            <>
              {!prUrl && prStatus !== 'merged' && prStatus !== 'closed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenPR}
                  className="h-7 md:h-8 px-2 md:px-3 flex-shrink-0"
                  title="Create PR"
                >
                  <GitPullRequest className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
                  <span className="text-xs md:text-sm">Open PR</span>
                </Button>
              )}
              {prUrl &&
                (prStatus === 'open' || isClosingPR || isMergingPR) &&
                prStatus !== 'closed' &&
                !isReopeningPR &&
                (() => {
                  console.log(
                    '[Render] Merge button - prStatus:',
                    prStatus,
                    'isClosingPR:',
                    isClosingPR,
                    'isMergingPR:',
                    isMergingPR,
                    'showMergePRDialog:',
                    showMergePRDialog,
                    'isReopeningPR:',
                    isReopeningPR,
                  )
                  return true
                })() && (
                  <div className="flex items-center gap-0 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenPR}
                      disabled={isClosingPR || isMergingPR}
                      className="h-7 md:h-8 px-2 md:px-3 rounded-r-none border-r-0"
                    >
                      {isClosingPR ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 animate-spin" />
                          <span className="text-xs md:text-sm">Closing...</span>
                        </>
                      ) : isMergingPR ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 animate-spin" />
                          <span className="text-xs md:text-sm">Merging...</span>
                        </>
                      ) : (
                        <>
                          <GitPullRequest className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
                          <span className="text-xs md:text-sm">Merge PR</span>
                        </>
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isClosingPR || isMergingPR}
                          className="h-7 md:h-8 px-1.5 rounded-l-none"
                        >
                          <ChevronDown className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleClosePR} disabled={isClosingPR || isMergingPR}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Close PR
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              {(prStatus === 'closed' || isReopeningPR) &&
                prUrl &&
                prNumber &&
                prStatus !== 'open' &&
                (() => {
                  console.log('[Render] Reopen button - prStatus:', prStatus, 'isReopeningPR:', isReopeningPR)
                  return true
                })() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReopenPR()}
                    disabled={isReopeningPR}
                    className="h-7 md:h-8 px-2 md:px-3 flex-shrink-0"
                    title="Reopen PR"
                  >
                    {isReopeningPR ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 animate-spin" />
                        <span className="text-xs md:text-sm">Reopening...</span>
                      </>
                    ) : (
                      <>
                        <GitPullRequest className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
                        <span className="text-xs md:text-sm">Reopen PR</span>
                      </>
                    )}
                  </Button>
                )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTryAgainDialog(true)}
            className="h-7 w-7 md:h-8 md:w-8 p-0 flex-shrink-0"
            title="Try Again"
          >
            <RotateCcw className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="h-7 w-7 md:h-8 md:w-8 p-0 flex-shrink-0"
            title="Delete Task"
          >
            <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </Button>
        </div>

        {/* Compact info row */}
        <div className="flex items-center gap-2 md:gap-4 flex-wrap text-xs md:text-sm">
          {/* Status */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn('flex items-center gap-2 cursor-help', getStatusColor(currentStatus))}>
                  {getStatusIcon(currentStatus)}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="space-y-1">
                <div>
                  <span className="font-medium">Status:</span>{' '}
                  <span className="text-muted-foreground capitalize">{currentStatus}</span>
                </div>
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
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <svg
                className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-muted-foreground"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
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
                className="text-muted-foreground hover:text-foreground truncate max-w-[120px] md:max-w-none"
              >
                {task.repoUrl.replace('https://github.com/', '').replace('.git', '')}
              </a>
            </div>
          )}

          {/* Branch */}
          {task.branchName && (
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <GitBranch className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-muted-foreground" />
              {task.repoUrl ? (
                <a
                  href={`${task.repoUrl.replace('.git', '')}/tree/${task.branchName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground truncate max-w-[120px] md:max-w-none"
                >
                  {task.branchName}
                </a>
              ) : (
                <span className="text-muted-foreground truncate max-w-[120px] md:max-w-none">{task.branchName}</span>
              )}
            </div>
          )}

          {/* Pull Request */}
          {prUrl && prNumber && (
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              {prStatus === 'merged' ? (
                <svg
                  className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-purple-500"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M5 3.254V3.25v.005a.75.75 0 110-.005v.004zm.45 1.9a2.25 2.25 0 10-1.95.218v5.256a2.25 2.25 0 101.5 0V7.123A5.735 5.735 0 009.25 9h1.378a2.251 2.251 0 100-1.5H9.25a4.25 4.25 0 01-3.8-2.346zM12.75 9a.75.75 0 100-1.5.75.75 0 000 1.5zm-8.5 4.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                </svg>
              ) : prStatus === 'closed' ? (
                <GitPullRequest className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-red-500" />
              ) : (
                <svg
                  className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-green-500"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M1.5 3.25a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zm5.677-.177L9.573.677A.25.25 0 0110 .854V2.5h1A2.5 2.5 0 0113.5 5v5.628a2.251 2.251 0 11-1.5 0V5a1 1 0 00-1-1h-1v1.646a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm0 9.5a.75.75 0 100 1.5.75.75 0 000-1.5zm8.25.75a.75.75 0 101.5 0 .75.75 0 00-1.5 0z" />
                </svg>
              )}
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground truncate"
              >
                #{prNumber}
              </a>
            </div>
          )}

          {/* Agent */}
          {(task.selectedAgent || task.selectedModel) && (
            <div className="flex items-center gap-1.5 md:gap-2">
              {task.selectedAgent &&
                (() => {
                  const AgentLogo = getAgentLogo(task.selectedAgent)
                  return AgentLogo ? <AgentLogo className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" /> : null
                })()}
              {task.selectedModel && (
                <span className="text-muted-foreground truncate">
                  {getModelName(task.selectedModel, task.selectedAgent)}
                </span>
              )}
            </div>
          )}

          {/* MCP Servers */}
          {!loadingMcpServers && mcpServers.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 md:gap-2 cursor-help text-muted-foreground">
                    <Cable className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">
                      {mcpServers.length} MCP Server{mcpServers.length !== 1 ? 's' : ''}
                    </span>
                    <span className="sm:hidden">{mcpServers.length} MCP</span>
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

          {/* Preview Deployment */}
          {!loadingDeployment && deploymentUrl && (
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <VercelIcon className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-muted-foreground" />
              <a
                href={deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground truncate"
              >
                Preview
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Changes Section */}
      {(currentStatus === 'pending' || currentStatus === 'processing') && !task.branchName ? (
        <div className="flex-1 flex items-center justify-center pl-6 pr-3">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Working...</p>
          </div>
        </div>
      ) : task.branchName ? (
        <div className="flex-1 flex flex-col md:flex-row gap-3 md:gap-4 pl-3 pr-3 md:pr-6 pt-3 md:pt-6 pb-3 md:pb-6 min-h-0 overflow-hidden">
          {/* File Browser */}
          <div className="w-full md:w-1/4 h-64 md:h-auto overflow-y-auto min-h-0 flex-shrink-0">
            <FileBrowser
              taskId={task.id}
              branchName={task.branchName}
              onFileSelect={setSelectedFile}
              onFilesLoaded={fetchAllDiffs}
              selectedFile={selectedFile}
              refreshKey={refreshKey}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>

          {/* Diff Viewer */}
          <div className="flex-1 min-h-0 min-w-0">
            <div className="bg-card rounded-md border overflow-hidden h-full">
              <div className="overflow-y-auto h-full">
                <FileDiffViewer
                  selectedFile={selectedFile}
                  diffsCache={diffsCache}
                  isInitialLoading={Object.keys(diffsCache).length === 0}
                  viewMode={viewMode}
                  taskId={task.id}
                />
              </div>
            </div>
          </div>

          {/* Chat */}
          <div className="w-full md:w-1/4 h-64 md:h-auto min-h-0 flex-shrink-0">
            <TaskChat taskId={task.id} task={task} />
          </div>
        </div>
      ) : null}

      {/* Try Again Dialog */}
      <AlertDialog open={showTryAgainDialog} onOpenChange={setShowTryAgainDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Try Again</AlertDialogTitle>
            <AlertDialogDescription>Create a new task with the same prompt and repository.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {CODING_AGENTS.map((agent) => (
                      <SelectItem key={agent.value} value={agent.value}>
                        <div className="flex items-center gap-2">
                          <agent.icon className="w-4 h-4" />
                          <span>{agent.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]?.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    )) || []}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTryAgain} disabled={isTryingAgain}>
              {isTryingAgain ? 'Creating...' : 'Create Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create PR Dialog */}
      <CreatePRDialog
        taskId={task.id}
        defaultTitle={task.prompt}
        defaultBody=""
        open={showPRDialog}
        onOpenChange={setShowPRDialog}
        onPRCreated={handlePRCreated}
      />

      {/* Merge PR Dialog */}
      {prUrl && prNumber && (
        <MergePRDialog
          taskId={task.id}
          prUrl={prUrl}
          prNumber={prNumber}
          open={showMergePRDialog}
          onOpenChange={handleMergeDialogClose}
          onPRMerged={handlePRMerged}
          onMergeInitiated={handleMergeInitiated}
        />
      )}
    </div>
  )
}
