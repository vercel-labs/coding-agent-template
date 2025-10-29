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
  Code,
  MessageSquare,
  FileText,
  Monitor,
  Eye,
  EyeOff,
  RefreshCw,
  Play,
  StopCircle,
  MoreVertical,
  X,
  ExternalLink,
  Plus,
  Maximize,
  Minimize,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { useTasks } from '@/components/app-layout'
import {
  getShowFilesPane,
  setShowFilesPane as saveShowFilesPane,
  getShowCodePane,
  setShowCodePane as saveShowCodePane,
  getShowPreviewPane,
  setShowPreviewPane as saveShowPreviewPane,
  getShowChatPane,
  setShowChatPane as saveShowChatPane,
} from '@/lib/utils/cookies'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { PRStatusIcon } from '@/components/pr-status-icon'

interface TaskDetailsProps {
  task: Task
  maxSandboxDuration?: number
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
  { value: 'copilot', label: 'Copilot', icon: Copilot },
  { value: 'cursor', label: 'Cursor', icon: Cursor },
  { value: 'gemini', label: 'Gemini', icon: Gemini },
  { value: 'opencode', label: 'opencode', icon: OpenCode },
] as const

const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
  ],
  codex: [
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'gpt-5-pro', label: 'GPT-5 pro' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
  ],
  copilot: [
    { value: 'claude-sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4', label: 'Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Haiku 4.5' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
  cursor: [
    { value: 'auto', label: 'Auto' },
    { value: 'composer-1', label: 'Composer' },
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
  copilot: 'claude-sonnet-4.5',
  cursor: 'auto',
  gemini: 'gemini-2.5-pro',
  opencode: 'gpt-5',
} as const

export function TaskDetails({ task, maxSandboxDuration = 300 }: TaskDetailsProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<Task['status'] | null>(null)
  const [mcpServers, setMcpServers] = useState<Connector[]>([])
  const [loadingMcpServers, setLoadingMcpServers] = useState(false)
  const [diffsCache, setDiffsCache] = useState<Record<string, DiffData>>({})
  const loadingDiffsRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const previousStatusRef = useRef<Task['status']>(task.status)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTryAgainDialog, setShowTryAgainDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTryingAgain, setIsTryingAgain] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(task.selectedAgent || 'claude')
  const [selectedModel, setSelectedModel] = useState<string>(
    task.selectedModel || DEFAULT_MODELS[(task.selectedAgent as keyof typeof DEFAULT_MODELS) || 'claude'],
  )
  const [tryAgainInstallDeps, setTryAgainInstallDeps] = useState(task.installDependencies || false)
  const [tryAgainMaxDuration, setTryAgainMaxDuration] = useState(task.maxDuration || maxSandboxDuration)
  const [tryAgainKeepAlive, setTryAgainKeepAlive] = useState(task.keepAlive || false)
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
  const [filesPane, setFilesPane] = useState<'files' | 'changes'>('changes')
  const [subMode, setSubMode] = useState<'local' | 'remote'>('remote')
  const viewMode: 'local' | 'remote' | 'all' | 'all-local' =
    filesPane === 'files' ? (subMode === 'local' ? 'all-local' : 'all') : subMode
  const [activeTab, setActiveTab] = useState<'code' | 'chat' | 'preview'>('code')
  const [showFilesList, setShowFilesList] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [sandboxTimeRemaining, setSandboxTimeRemaining] = useState<string | null>(null)

  // Desktop pane toggles - initialize from cookies
  const [showFilesPane, setShowFilesPane] = useState(() => getShowFilesPane())
  const [showCodePane, setShowCodePane] = useState(() => getShowCodePane())
  const [showPreviewPane, setShowPreviewPane] = useState(() => getShowPreviewPane())
  const [showChatPane, setShowChatPane] = useState(() => getShowChatPane())
  const [previewKey, setPreviewKey] = useState(0)
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
  const [isRestartingDevServer, setIsRestartingDevServer] = useState(false)
  const [isStoppingSandbox, setIsStoppingSandbox] = useState(false)
  const [isStartingSandbox, setIsStartingSandbox] = useState(false)
  const [sandboxHealth, setSandboxHealth] = useState<'running' | 'starting' | 'error' | 'stopped' | 'not_available'>(
    'starting',
  )
  const healthyCountRef = useRef<number>(0)
  const lastHealthStatusRef = useRef<string | null>(null)

  // Initialize model correctly on mount and when agent changes in Try Again dialog
  useEffect(() => {
    const agent = selectedAgent as keyof typeof DEFAULT_MODELS
    const taskModel = task.selectedModel

    // Check if the task's model exists in the agent's model list
    const agentModels = AGENT_MODELS[agent]
    const modelExists = agentModels?.some((m) => m.value === taskModel)

    // Use task model if it exists for the agent, otherwise use default
    const correctModel = modelExists && taskModel ? taskModel : DEFAULT_MODELS[agent]

    if (correctModel !== selectedModel) {
      setSelectedModel(correctModel)
    }
  }, [selectedAgent, task.selectedModel, selectedModel])

  // File search state
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [showFileDropdown, setShowFileDropdown] = useState(false)
  const [allFiles, setAllFiles] = useState<string[]>([])
  const fileSearchRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({})
  const { refreshTasks } = useTasks()
  const router = useRouter()

  // Tabs state for Code pane - each mode has its own tabs and selection
  const [openTabsByMode, setOpenTabsByMode] = useState<{
    local: string[]
    remote: string[]
    all: string[]
    'all-local': string[]
  }>({
    local: [],
    remote: [],
    all: [],
    'all-local': [],
  })
  const [activeTabIndexByMode, setActiveTabIndexByMode] = useState<{
    local: number
    remote: number
    all: number
    'all-local': number
  }>({
    local: 0,
    remote: 0,
    all: 0,
    'all-local': 0,
  })
  const [selectedFileByMode, setSelectedFileByMode] = useState<{
    local: string | undefined
    remote: string | undefined
    all: string | undefined
    'all-local': string | undefined
  }>({
    local: undefined,
    remote: undefined,
    all: undefined,
    'all-local': undefined,
  })
  const [selectedItemIsFolderByMode, setSelectedItemIsFolderByMode] = useState<{
    local: boolean
    remote: boolean
    all: boolean
    'all-local': boolean
  }>({
    local: false,
    remote: false,
    all: false,
    'all-local': false,
  })
  const [tabsWithUnsavedChanges, setTabsWithUnsavedChanges] = useState<Set<string>>(new Set())
  const [tabsSaving, setTabsSaving] = useState<Set<string>>(new Set())
  const [showCloseTabDialog, setShowCloseTabDialog] = useState(false)
  const [tabToClose, setTabToClose] = useState<number | null>(null)
  // Track loaded file content hashes to detect changes
  const [loadedFileHashes, setLoadedFileHashes] = useState<Record<string, string>>({})

  // Get current mode's tabs and selection
  const openTabs = openTabsByMode[viewMode]
  const activeTabIndex = activeTabIndexByMode[viewMode]
  const selectedFile = selectedFileByMode[viewMode]
  const selectedItemIsFolder = selectedItemIsFolderByMode[viewMode]

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

  // View mode change handler
  const handleViewModeChange = useCallback((newMode: 'local' | 'remote' | 'all' | 'all-local') => {
    if (newMode === 'all' || newMode === 'all-local') {
      setFilesPane('files')
      setSubMode(newMode === 'all-local' ? 'local' : 'remote')
    } else {
      setFilesPane('changes')
      setSubMode(newMode)
    }
  }, [])

  // Tab management functions
  const openFileInTab = async (file: string, isFolder?: boolean) => {
    // If it's a folder, just update the selected file state (for creating files/folders in that location)
    if (isFolder) {
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: file }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: true }))
      return
    }

    // Mark as not a folder
    setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))

    const currentTabs = openTabsByMode[viewMode]
    const existingIndex = currentTabs.indexOf(file)

    // For Changes mode (local or remote), only show one file at a time (no tabs)
    const isChangesMode = viewMode === 'local' || viewMode === 'remote'

    // Check if file is already loaded and has changed
    if (existingIndex !== -1 && loadedFileHashes[file]) {
      try {
        const params = new URLSearchParams()
        params.set('filename', file)

        const endpoint =
          viewMode === 'all' || viewMode === 'all-local'
            ? `/api/tasks/${task.id}/file-content`
            : `/api/tasks/${task.id}/diff`

        if (viewMode === 'local' || viewMode === 'all-local') {
          params.set('mode', 'local')
        }

        const response = await fetch(`${endpoint}?${params.toString()}`)
        const result = await response.json()

        if (result.success && result.data) {
          // Create a simple hash of the content
          const newContent = result.data.newContent || result.data.oldContent || ''
          const newHash = `${newContent.length}-${newContent.substring(0, 100)}`

          if (loadedFileHashes[file] !== newHash) {
            // Content has changed, show toast
            toast.info(`File "${file}" has been updated`, {
              description: 'The file has new changes. Would you like to reload it?',
              duration: 10000,
              action: {
                label: 'Load Latest',
                onClick: () => {
                  // Update hash and force reload by changing selection
                  setLoadedFileHashes((prev) => ({ ...prev, [file]: newHash }))
                  // Force reload by briefly deselecting then reselecting
                  setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: undefined }))
                  setTimeout(() => {
                    setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: existingIndex }))
                    setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: file }))
                  }, 10)
                },
              },
              cancel: {
                label: 'Ignore',
                onClick: () => {
                  // Just switch to the tab without reloading
                  setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: existingIndex }))
                  setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: file }))
                },
              },
            })
            return
          }
        }
      } catch (err) {
        console.error('Error checking for file changes:', err)
        // Continue with normal flow on error
      }
    }

    if (isChangesMode) {
      // Replace the current file (only one file at a time)
      setOpenTabsByMode((prev) => ({ ...prev, [viewMode]: [file] }))
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: 0 }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: file }))
    } else {
      // Files mode: use tabs
      if (existingIndex !== -1) {
        // File already open in this mode, just switch to it
        setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: existingIndex }))
        setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: file }))
      } else {
        // Open new tab in current mode
        const newTabs = [...currentTabs, file]
        setOpenTabsByMode((prev) => ({ ...prev, [viewMode]: newTabs }))
        setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newTabs.length - 1 }))
        setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: file }))
      }
    }
  }

  const handleUnsavedChanges = useCallback((filename: string, hasChanges: boolean) => {
    setTabsWithUnsavedChanges((prev) => {
      const newSet = new Set(prev)
      if (hasChanges) {
        newSet.add(filename)
      } else {
        newSet.delete(filename)
      }
      return newSet
    })
  }, [])

  const handleSavingStateChange = useCallback((filename: string, isSaving: boolean) => {
    setTabsSaving((prev) => {
      const newSet = new Set(prev)
      if (isSaving) {
        newSet.add(filename)
      } else {
        newSet.delete(filename)
      }
      return newSet
    })
  }, [])

  const handleSaveSuccess = useCallback(() => {
    // When a file is saved in 'all-local' mode, refresh the file browser
    // to update file status (show modified files in yellow)
    if (viewMode === 'all-local') {
      setRefreshKey((prev) => prev + 1)
    }
  }, [viewMode])

  const handleFileLoaded = useCallback((filename: string, content: string) => {
    // Create a simple hash of the content when file is loaded
    const hash = `${content.length}-${content.substring(0, 100)}`
    setLoadedFileHashes((prev) => ({ ...prev, [filename]: hash }))
  }, [])

  const attemptCloseTab = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const currentTabs = openTabsByMode[viewMode]
    const fileToClose = currentTabs[index]

    // Check if the tab has unsaved changes
    if (tabsWithUnsavedChanges.has(fileToClose)) {
      setTabToClose(index)
      setShowCloseTabDialog(true)
    } else {
      closeTab(index)
    }
  }

  const closeTab = (index: number) => {
    const currentTabs = openTabsByMode[viewMode]
    const currentActiveIndex = activeTabIndexByMode[viewMode]
    const fileToClose = currentTabs[index]
    const newTabs = currentTabs.filter((_, i) => i !== index)

    setOpenTabsByMode((prev) => ({ ...prev, [viewMode]: newTabs }))

    // Remove from unsaved changes
    setTabsWithUnsavedChanges((prev) => {
      const newSet = new Set(prev)
      newSet.delete(fileToClose)
      return newSet
    })

    // Adjust active tab index
    if (newTabs.length === 0) {
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: 0 }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: undefined }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    } else if (currentActiveIndex >= newTabs.length) {
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newTabs.length - 1 }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: newTabs[newTabs.length - 1] }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    } else if (currentActiveIndex === index) {
      // If closing the active tab, switch to the previous tab (or next if it's the first)
      const newIndex = Math.max(0, index - 1)
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newIndex }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: newTabs[newIndex] }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    } else if (currentActiveIndex > index) {
      // Adjust index if a tab before the active one was closed
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: currentActiveIndex - 1 }))
    }
  }

  const handleCloseTabConfirm = (save: boolean) => {
    if (tabToClose === null) return

    if (save) {
      // Trigger save by dispatching Cmd+S event
      const event = new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
        bubbles: true,
      })
      document.dispatchEvent(event)
      // Wait a moment for save to complete, then close
      setTimeout(() => {
        closeTab(tabToClose)
        setShowCloseTabDialog(false)
        setTabToClose(null)
      }, 500)
    } else {
      closeTab(tabToClose)
      setShowCloseTabDialog(false)
      setTabToClose(null)
    }
  }

  const switchToTab = (index: number) => {
    const currentTabs = openTabsByMode[viewMode]
    setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: index }))
    setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: currentTabs[index] }))
    setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
  }

  // Use optimistic status if available, otherwise use actual task status
  const currentStatus = optimisticStatus || task.status

  // Clear optimistic status when task status actually changes
  useEffect(() => {
    if (optimisticStatus && task.status === optimisticStatus) {
      setOptimisticStatus(null)
    }
  }, [task.status, optimisticStatus])

  // Calculate and update sandbox time remaining
  useEffect(() => {
    // Show timer if keepAlive is enabled and sandbox has been created (not pending)
    if (!task.keepAlive || currentStatus === 'pending' || !task.createdAt) {
      setSandboxTimeRemaining(null)
      return
    }

    const calculateTimeRemaining = () => {
      // Sandbox timeout starts from when it was CREATED, not completed
      const createdTime = new Date(task.createdAt!).getTime()
      const now = Date.now()
      const maxDurationMs = (task.maxDuration || 300) * 60 * 1000 // maxDuration is in minutes
      const elapsed = now - createdTime
      const remaining = maxDurationMs - elapsed

      if (remaining <= 0) {
        return null
      }

      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))

      return `${hours}h ${minutes}m`
    }

    // Update immediately
    setSandboxTimeRemaining(calculateTimeRemaining())

    // Update every minute
    const interval = setInterval(() => {
      setSandboxTimeRemaining(calculateTimeRemaining())
    }, 60000) // 60 seconds

    return () => clearInterval(interval)
  }, [currentStatus, task.keepAlive, task.createdAt])

  // Periodic sandbox health check
  useEffect(() => {
    if (!task.sandboxUrl) {
      setSandboxHealth('not_available')
      healthyCountRef.current = 0
      lastHealthStatusRef.current = null
      return
    }

    // Set to starting initially until we confirm it's healthy
    setSandboxHealth('starting')

    const checkHealth = async () => {
      try {
        const response = await fetch(`/api/tasks/${task.id}/sandbox-health`)
        if (response.ok) {
          const data = await response.json()
          const currentStatus = data.status

          // If status is 'running', require it to be stable for 2 checks (4 seconds)
          if (currentStatus === 'running') {
            if (lastHealthStatusRef.current === 'running') {
              healthyCountRef.current += 1
              // Only set to running after 2 consecutive healthy checks (4 seconds)
              if (healthyCountRef.current >= 2) {
                setSandboxHealth('running')
              } else {
                // Still show starting while we're waiting for stability
                setSandboxHealth('starting')
              }
            } else {
              // First healthy check, reset counter
              healthyCountRef.current = 1
              lastHealthStatusRef.current = 'running'
              setSandboxHealth('starting')
            }
          } else {
            // Not running, reset counter and set status immediately
            healthyCountRef.current = 0
            lastHealthStatusRef.current = currentStatus
            setSandboxHealth(data.status)
          }
        }
      } catch (error) {
        console.error('Health check failed:', error)
        healthyCountRef.current = 0
        lastHealthStatusRef.current = null
      }
    }

    // Check immediately
    checkHealth()

    // Check every 2 seconds
    const interval = setInterval(checkHealth, 2000)

    return () => {
      clearInterval(interval)
      healthyCountRef.current = 0
      lastHealthStatusRef.current = null
    }
  }, [task.id, task.sandboxUrl])

  const getAgentLogo = (agent: string | null) => {
    if (!agent) return null

    switch (agent.toLowerCase()) {
      case 'claude':
        return Claude
      case 'codex':
        return Codex
      case 'copilot':
        return Copilot
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
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
      { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    ],
    codex: [
      { value: 'openai/gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
      { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
      { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
      { value: 'gpt-5-pro', label: 'GPT-5 pro' },
      { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
    ],
    copilot: [
      { value: 'claude-sonnet-4.5', label: 'Sonnet 4.5' },
      { value: 'claude-sonnet-4', label: 'Sonnet 4' },
      { value: 'claude-haiku-4.5', label: 'Haiku 4.5' },
      { value: 'gpt-5', label: 'GPT-5' },
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

  // Fetch diffs for changed files only (in "changes" mode)
  const fetchAllDiffs = useCallback(
    async (filesList: string[]) => {
      if (!filesList.length || loadingDiffsRef.current) return

      // Store all files for search
      setAllFiles(filesList)

      // Only pre-fetch diffs in "local" or "remote" mode
      if (viewMode !== 'local' && viewMode !== 'remote') return

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
    [task.id, viewMode],
  )

  // Handle click outside file dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileSearchRef.current && !fileSearchRef.current.contains(event.target as Node)) {
        setShowFileDropdown(false)
      }
    }

    if (showFileDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFileDropdown])

  // Keyboard shortcuts for pane toggles and tab management
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Tab management shortcuts (Cmd/Ctrl + W to close, Cmd/Ctrl + 1-9 to switch)
      if (event.metaKey || event.ctrlKey) {
        // Close current tab with Cmd/Ctrl + W
        if (event.key === 'w' && openTabs.length > 0) {
          event.preventDefault()
          attemptCloseTab(activeTabIndex)
          return
        }

        // Switch to tab 1-9 with Cmd/Ctrl + 1-9
        const digit = parseInt(event.key)
        if (digit >= 1 && digit <= 9 && openTabs.length >= digit) {
          event.preventDefault()
          switchToTab(digit - 1)
          return
        }
      }

      // Pane toggle shortcuts (Alt + 1-4)
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        // Use event.code instead of event.key to handle macOS Option key special characters
        switch (event.code) {
          case 'Digit1':
            event.preventDefault()
            setShowFilesPane((prev) => {
              const newValue = !prev
              saveShowFilesPane(newValue)
              return newValue
            })
            break
          case 'Digit2':
            event.preventDefault()
            setShowCodePane((prev) => {
              const newValue = !prev
              saveShowCodePane(newValue)
              return newValue
            })
            break
          case 'Digit3':
            event.preventDefault()
            setShowPreviewPane((prev) => {
              const newValue = !prev
              saveShowPreviewPane(newValue)
              return newValue
            })
            break
          case 'Digit4':
            event.preventDefault()
            setShowChatPane((prev) => {
              const newValue = !prev
              saveShowChatPane(newValue)
              return newValue
            })
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openTabs, activeTabIndex])

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
      // Clear selected files for all modes
      setSelectedFileByMode({ local: undefined, remote: undefined, all: undefined, 'all-local': undefined })
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

  // Scroll active tab into view when it changes
  useEffect(() => {
    const tabKey = `${viewMode}-${activeTabIndex}`
    const activeTabButton = tabButtonRefs.current[tabKey]

    if (activeTabButton && tabsContainerRef.current) {
      // Use scrollIntoView with smooth behavior and inline: 'center' to center the tab in view
      activeTabButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [activeTabIndex, selectedFile, viewMode])

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
          installDependencies: tryAgainInstallDeps,
          maxDuration: tryAgainMaxDuration,
          keepAlive: tryAgainKeepAlive,
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

  const handleRestartDevServer = async () => {
    setIsRestartingDevServer(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/restart-dev`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Dev server restarted successfully!')
        // Refresh the preview after a short delay to allow server to start
        setTimeout(() => {
          setPreviewKey((prev) => prev + 1)
        }, 2000)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to restart dev server')
      }
    } catch (error) {
      console.error('Error restarting dev server:', error)
      toast.error('Failed to restart dev server')
    } finally {
      setIsRestartingDevServer(false)
    }
  }

  const handleStopSandbox = async () => {
    setIsStoppingSandbox(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/stop-sandbox`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Sandbox stopped successfully!')
        // Refresh tasks to update UI
        await refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to stop sandbox')
      }
    } catch (error) {
      console.error('Error stopping sandbox:', error)
      toast.error('Failed to stop sandbox')
    } finally {
      setIsStoppingSandbox(false)
    }
  }

  const handleStartSandbox = async () => {
    setIsStartingSandbox(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/start-sandbox`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Sandbox started successfully!')
        // Refresh tasks to update UI
        await refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to start sandbox')
      }
    } catch (error) {
      console.error('Error starting sandbox:', error)
      toast.error('Failed to start sandbox')
    } finally {
      setIsStartingSandbox(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Overview Section */}
      <div className="space-y-2 md:space-y-3 pb-3 md:pb-6 border-b pl-3 md:pl-6 pr-3 flex-shrink-0">
        {/* Prompt */}
        <div className="flex items-center gap-2">
          {currentStatus === 'processing' ? (
            <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-muted-foreground" />
          ) : (
            prStatus && <PRStatusIcon status={prStatus} className="h-4 w-4 md:h-5 md:w-5" />
          )}
          <p className="text-lg md:text-2xl flex-1 truncate">{task.title || task.prompt}</p>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 md:h-8 md:w-8 p-0 flex-shrink-0"
                title="More options"
              >
                <MoreVertical className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  // Extract owner and repo from repoUrl
                  const repoUrl = task.repoUrl || ''
                  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/)
                  const owner = match?.[1] || ''
                  const repo = match?.[2] || ''

                  // Build the URL with query parameters
                  const params = new URLSearchParams()
                  if (owner) params.set('owner', owner)
                  if (repo) params.set('repo', repo)
                  if (task.selectedAgent) params.set('agent', task.selectedAgent)
                  if (task.selectedModel) params.set('model', task.selectedModel)

                  router.push(`/?${params.toString()}`)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowTryAgainDialog(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Again
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Compact info row */}
        <div className="flex items-center gap-2 md:gap-4 md:flex-wrap text-xs md:text-sm overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* Repo */}
          {task.repoUrl && (
            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
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
                className="text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                {task.repoUrl.replace('https://github.com/', '').replace(/\.git$/, '')}
              </a>
            </div>
          )}

          {/* Branch */}
          {task.branchName && (
            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
              <GitBranch className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 text-muted-foreground" />
              {task.repoUrl ? (
                <a
                  href={`${task.repoUrl.replace(/\.git$/, '')}/tree/${task.branchName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  {task.branchName}
                </a>
              ) : (
                <span className="text-muted-foreground whitespace-nowrap">{task.branchName}</span>
              )}
            </div>
          )}

          {/* Pull Request */}
          {prUrl && prNumber && (
            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
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
                className="text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                #{prNumber}
              </a>
            </div>
          )}

          {/* Agent */}
          {(task.selectedAgent || task.selectedModel) && (
            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
              {task.selectedAgent &&
                (() => {
                  const AgentLogo = getAgentLogo(task.selectedAgent)
                  return AgentLogo ? <AgentLogo className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" /> : null
                })()}
              {task.selectedModel && (
                <span className="text-muted-foreground whitespace-nowrap">
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

          {/* Desktop Pane Toggles - Only show on desktop */}
          <div className="hidden md:flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newValue = !showFilesPane
                setShowFilesPane(newValue)
                saveShowFilesPane(newValue)
              }}
              className={cn(
                'h-7 px-3 text-xs font-medium transition-colors',
                showFilesPane
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              Files
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newValue = !showCodePane
                setShowCodePane(newValue)
                saveShowCodePane(newValue)
              }}
              className={cn(
                'h-7 px-3 text-xs font-medium transition-colors',
                showCodePane
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newValue = !showPreviewPane
                setShowPreviewPane(newValue)
                saveShowPreviewPane(newValue)
              }}
              className={cn(
                'h-7 px-3 text-xs font-medium transition-colors',
                showPreviewPane
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              Sandbox
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const newValue = !showChatPane
                setShowChatPane(newValue)
                saveShowChatPane(newValue)
              }}
              className={cn(
                'h-7 px-3 text-xs font-medium transition-colors',
                showChatPane
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              Chat
            </Button>
          </div>
        </div>
      </div>

      {/* Changes Section - Only show when a branch exists */}
      {task.branchName && task.branchName.trim().length > 0 ? (
        <>
          {/* Desktop Layout */}
          <div className="hidden md:flex flex-1 gap-3 md:gap-4 pl-3 pr-3 md:pr-6 pt-3 md:pt-6 pb-3 md:pb-6 min-h-0 overflow-hidden">
            {/* File Browser - Always rendered but hidden with CSS to ensure files are loaded */}
            <div className={cn('w-1/4 h-auto overflow-y-auto min-h-0 flex-shrink-0', !showFilesPane && 'hidden')}>
              <FileBrowser
                taskId={task.id}
                branchName={task.branchName}
                repoUrl={task.repoUrl}
                onFileSelect={openFileInTab}
                onFilesLoaded={fetchAllDiffs}
                selectedFile={selectedFile}
                refreshKey={refreshKey}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
              />
            </div>

            {/* Code Viewer */}
            {showCodePane && (
              <div className="flex-1 min-h-0 min-w-0">
                <div className="bg-card rounded-md border overflow-hidden h-full flex flex-col">
                  {/* Tabs and Search Bar */}
                  <div className="flex flex-col border-b bg-muted/50 flex-shrink-0">
                    {/* Tabs Row */}
                    {openTabs.length > 0 && (viewMode === 'all' || viewMode === 'all-local') && (
                      <div
                        ref={tabsContainerRef}
                        className="flex items-center gap-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-b"
                      >
                        {openTabs.map((filename, index) => {
                          const hasUnsavedChanges = tabsWithUnsavedChanges.has(filename)
                          const isSaving = tabsSaving.has(filename)
                          const tabKey = `${viewMode}-${index}`
                          return (
                            <button
                              key={filename}
                              ref={(el) => {
                                tabButtonRefs.current[tabKey] = el
                              }}
                              onClick={() => switchToTab(index)}
                              className={cn(
                                'group flex items-center gap-2 px-3 py-2 text-sm border-r transition-colors flex-shrink-0 max-w-[240px]',
                                activeTabIndex === index
                                  ? 'bg-background text-foreground'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                              )}
                            >
                              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate flex-1">{filename.split('/').pop()}</span>
                              <span
                                onClick={(e) => attemptCloseTab(index, e)}
                                className={cn(
                                  'flex items-center justify-center w-4 h-4 rounded transition-all cursor-pointer hover:bg-accent flex-shrink-0',
                                  hasUnsavedChanges || isSaving ? '' : 'opacity-0 group-hover:opacity-100',
                                )}
                                title={
                                  isSaving
                                    ? 'Saving...'
                                    : hasUnsavedChanges
                                      ? 'Unsaved changes • Click to close'
                                      : 'Close tab'
                                }
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    attemptCloseTab(index)
                                  }
                                }}
                              >
                                {isSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : hasUnsavedChanges ? (
                                  <>
                                    <span className="w-2 h-2 rounded-full bg-foreground group-hover:hidden" />
                                    <X className="h-3 w-3 hidden group-hover:block" />
                                  </>
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Search Bar */}
                    <div ref={fileSearchRef} className="relative flex items-center gap-2 px-3 py-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <input
                        type="text"
                        value={fileSearchQuery}
                        onChange={(e) => {
                          setFileSearchQuery(e.target.value)
                          setShowFileDropdown(true)
                        }}
                        onFocus={() => setShowFileDropdown(true)}
                        placeholder="Type to search files..."
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />

                      {/* Dropdown */}
                      {showFileDropdown &&
                        (() => {
                          const query = fileSearchQuery.toLowerCase()
                          const filteredFiles = allFiles
                            .filter((file) => file.toLowerCase().includes(query))
                            .slice(0, 50)

                          if (filteredFiles.length === 0) return null

                          return (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-[300px] overflow-y-auto z-50">
                              {filteredFiles.map((file) => (
                                <button
                                  key={file}
                                  onClick={() => {
                                    openFileInTab(file)
                                    setFileSearchQuery('')
                                    setShowFileDropdown(false)
                                  }}
                                  className={cn(
                                    'w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors',
                                    selectedFile === file && 'bg-accent',
                                  )}
                                >
                                  {file}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1">
                    <FileDiffViewer
                      selectedFile={selectedItemIsFolder ? undefined : selectedFile}
                      diffsCache={diffsCache}
                      isInitialLoading={Object.keys(diffsCache).length === 0}
                      viewMode={viewMode}
                      taskId={task.id}
                      onUnsavedChanges={
                        selectedFile ? (hasChanges) => handleUnsavedChanges(selectedFile, hasChanges) : undefined
                      }
                      onSavingStateChange={
                        selectedFile ? (isSaving) => handleSavingStateChange(selectedFile, isSaving) : undefined
                      }
                      onOpenFile={(filename, lineNumber) => {
                        openFileInTab(filename)
                        // TODO: Optionally scroll to lineNumber after opening
                      }}
                      onSaveSuccess={handleSaveSuccess}
                      onFileLoaded={handleFileLoaded}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Preview */}
            {showPreviewPane && (
              <div className={cn('flex-1 min-h-0 min-w-0', isPreviewFullscreen && 'fixed inset-0 z-50 bg-background')}>
                <div className="bg-card rounded-md border overflow-hidden h-full flex flex-col">
                  {/* Preview Toolbar */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 flex-shrink-0 min-h-[40px]">
                    <Monitor className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {task.sandboxUrl && sandboxHealth !== 'stopped' ? (
                      <a
                        href={task.sandboxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground truncate flex-1 transition-colors"
                        title={task.sandboxUrl}
                      >
                        {task.sandboxUrl}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground truncate flex-1">
                        {sandboxHealth === 'stopped'
                          ? 'Sandbox stopped'
                          : currentStatus === 'pending' || currentStatus === 'processing'
                            ? 'Creating sandbox...'
                            : 'Sandbox not running'}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewKey((prev) => prev + 1)}
                      className="h-6 w-6 p-0 flex-shrink-0"
                      title="Refresh Preview"
                      disabled={!task.sandboxUrl}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                      className="h-6 w-6 p-0 flex-shrink-0"
                      title={isPreviewFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {isPreviewFullscreen ? (
                        <Minimize className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0"
                          disabled={isRestartingDevServer || isStoppingSandbox || isStartingSandbox}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.keepAlive && (
                          <>
                            {sandboxHealth === 'stopped' || !task.sandboxUrl ? (
                              <DropdownMenuItem onClick={handleStartSandbox} disabled={isStartingSandbox}>
                                {isStartingSandbox ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Starting...
                                  </>
                                ) : (
                                  'Start Sandbox'
                                )}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={handleStopSandbox} disabled={isStoppingSandbox}>
                                {isStoppingSandbox ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Stopping...
                                  </>
                                ) : (
                                  'Stop Sandbox'
                                )}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {sandboxHealth === 'running' && (
                          <DropdownMenuItem onClick={handleRestartDevServer} disabled={isRestartingDevServer}>
                            {isRestartingDevServer ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Restarting...
                              </>
                            ) : (
                              'Restart Dev Server'
                            )}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {task.sandboxUrl ? (
                      <div className="relative w-full h-full">
                        {sandboxHealth === 'running' ? (
                          <iframe
                            key={previewKey}
                            src={task.sandboxUrl}
                            className="w-full h-full border-0"
                            title="Preview"
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                          />
                        ) : null}
                        {sandboxHealth === 'starting' && (
                          <div className="absolute inset-0 bg-background flex items-center justify-center">
                            <div className="text-center">
                              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">Starting dev server...</p>
                            </div>
                          </div>
                        )}
                        {sandboxHealth === 'stopped' && (
                          <div className="absolute inset-0 bg-background flex items-center justify-center">
                            <div className="text-center">
                              <StopCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground mb-1">Sandbox Stopped</p>
                              <p className="text-xs text-muted-foreground">Start a new sandbox from the menu above</p>
                            </div>
                          </div>
                        )}
                        {sandboxHealth === 'error' && (
                          <div className="absolute inset-0 bg-background flex items-center justify-center">
                            <div className="text-center">
                              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
                              <p className="text-sm text-muted-foreground mb-1">Application Error</p>
                              <p className="text-xs text-muted-foreground">The dev server encountered an error</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-6 text-center">
                        <div>
                          {currentStatus === 'pending' || currentStatus === 'processing' ? (
                            <>
                              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                              <p className="mb-1">Creating sandbox...</p>
                              <p className="text-xs">The preview will appear here once the dev server starts</p>
                            </>
                          ) : (
                            <>
                              <p className="mb-1">Sandbox not running</p>
                              <p className="text-xs">
                                {task.keepAlive
                                  ? 'Start it from the menu above to view the preview'
                                  : 'This task does not have keep-alive enabled'}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Chat */}
            {showChatPane && (
              <div className="w-1/4 h-auto min-h-0 flex-shrink-0">
                <TaskChat taskId={task.id} task={task} />
              </div>
            )}
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden flex flex-col flex-1 min-h-0 relative pb-14">
            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {/* Code Tab */}
              <div className={cn('relative h-full', activeTab !== 'code' && 'hidden')}>
                {/* Current File Path Bar */}
                <div className="px-3 pt-3 pb-2 flex items-center gap-2 bg-background border-b">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilesList(true)}
                    className="h-6 w-6 p-0 flex-shrink-0"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground truncate flex-1">
                    {selectedFile || 'Select a file'}
                  </span>
                </div>

                {/* Diff Viewer */}
                <div className="bg-card md:rounded-md md:border overflow-hidden h-[calc(100%-41px)]">
                  <div className="overflow-y-auto h-full">
                    <FileDiffViewer
                      selectedFile={selectedItemIsFolder ? undefined : selectedFile}
                      diffsCache={diffsCache}
                      isInitialLoading={Object.keys(diffsCache).length === 0}
                      viewMode={viewMode}
                      taskId={task.id}
                      onUnsavedChanges={
                        selectedFile ? (hasChanges) => handleUnsavedChanges(selectedFile, hasChanges) : undefined
                      }
                      onSavingStateChange={
                        selectedFile ? (isSaving) => handleSavingStateChange(selectedFile, isSaving) : undefined
                      }
                      onOpenFile={(filename, lineNumber) => {
                        openFileInTab(filename)
                        // TODO: Optionally scroll to lineNumber after opening
                      }}
                      onFileLoaded={handleFileLoaded}
                      onSaveSuccess={handleSaveSuccess}
                    />
                  </div>
                </div>
              </div>

              {/* Chat Tab */}
              <div className={cn('h-full px-3 pb-3', activeTab !== 'chat' && 'hidden')}>
                <TaskChat taskId={task.id} task={task} />
              </div>

              {/* Preview Tab */}
              <div
                className={cn(
                  'h-full',
                  activeTab !== 'preview' && 'hidden',
                  isPreviewFullscreen && 'fixed inset-0 z-50 bg-background',
                )}
              >
                <div className="bg-card md:rounded-md md:border overflow-hidden h-full flex flex-col">
                  {/* Preview Toolbar */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 flex-shrink-0 min-h-[40px]">
                    <Monitor className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {task.sandboxUrl ? (
                      <a
                        href={task.sandboxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground truncate flex-1 transition-colors"
                        title={task.sandboxUrl}
                      >
                        {task.sandboxUrl}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground truncate flex-1">
                        {currentStatus === 'pending' || currentStatus === 'processing'
                          ? 'Creating sandbox...'
                          : 'Sandbox not running'}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewKey((prev) => prev + 1)}
                      className="h-6 w-6 p-0 flex-shrink-0"
                      title="Refresh Preview"
                      disabled={!task.sandboxUrl}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                      className="h-6 w-6 p-0 flex-shrink-0"
                      title={isPreviewFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {isPreviewFullscreen ? (
                        <Minimize className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0"
                          disabled={isRestartingDevServer || isStoppingSandbox || isStartingSandbox}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.keepAlive && (
                          <>
                            {task.sandboxUrl ? (
                              <DropdownMenuItem onClick={handleStopSandbox} disabled={isStoppingSandbox}>
                                {isStoppingSandbox ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Stopping...
                                  </>
                                ) : (
                                  'Stop Sandbox'
                                )}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={handleStartSandbox} disabled={isStartingSandbox}>
                                {isStartingSandbox ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Starting...
                                  </>
                                ) : (
                                  'Start Sandbox'
                                )}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        <DropdownMenuItem
                          onClick={handleRestartDevServer}
                          disabled={isRestartingDevServer || !task.sandboxUrl}
                        >
                          {isRestartingDevServer ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Restarting...
                            </>
                          ) : (
                            'Restart Dev Server'
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {task.sandboxUrl ? (
                    <div className="overflow-y-auto flex-1 relative">
                      {sandboxHealth === 'running' ? (
                        <iframe
                          key={previewKey}
                          src={task.sandboxUrl}
                          className="w-full h-full border-0"
                          title="Preview"
                          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                        />
                      ) : null}
                      {sandboxHealth === 'starting' && (
                        <div className="absolute inset-0 bg-background flex items-center justify-center">
                          <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Starting dev server...</p>
                          </div>
                        </div>
                      )}
                      {sandboxHealth === 'stopped' && (
                        <div className="absolute inset-0 bg-background flex items-center justify-center">
                          <div className="text-center">
                            <StopCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground mb-1">Sandbox Stopped</p>
                            <p className="text-xs text-muted-foreground">Start a new sandbox from the menu above</p>
                          </div>
                        </div>
                      )}
                      {sandboxHealth === 'error' && (
                        <div className="absolute inset-0 bg-background flex items-center justify-center">
                          <div className="text-center">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
                            <p className="text-sm text-muted-foreground mb-1">Application Error</p>
                            <p className="text-xs text-muted-foreground">The dev server encountered an error</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-6 text-center">
                      <div>
                        {currentStatus === 'pending' || currentStatus === 'processing' ? (
                          <>
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                            <p className="mb-1">Creating sandbox...</p>
                            <p className="text-xs mb-4">The preview will appear here once the dev server starts</p>
                          </>
                        ) : (
                          <>
                            <p className="mb-1">Sandbox not running</p>
                            <p className="text-xs mb-4">
                              {task.keepAlive
                                ? 'Start the sandbox to view the preview'
                                : 'This task does not have keep-alive enabled'}
                            </p>
                          </>
                        )}
                        {task.keepAlive && !task.sandboxUrl && (
                          <Button size="sm" onClick={handleStartSandbox} disabled={isStartingSandbox} className="mt-2">
                            {isStartingSandbox ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Starting...
                              </>
                            ) : (
                              'Start Sandbox'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Tab Bar */}
            <div className="absolute bottom-0 left-0 right-0 border-t bg-background">
              <div className="flex h-14">
                <button
                  onClick={() => setActiveTab('code')}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                    activeTab === 'code' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Code className="h-5 w-5" />
                  <span className="text-xs font-medium">Code</span>
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                    activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-xs font-medium">Chat</span>
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                    activeTab === 'preview' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Monitor className="h-5 w-5" />
                  <span className="text-xs font-medium">Sandbox</span>
                </button>
              </div>
            </div>

            {/* Files List Drawer */}
            <Drawer open={showFilesList} onOpenChange={setShowFilesList}>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Files</DrawerTitle>
                  <div className="mt-2">
                    {/* Main Navigation with segment button on the right */}
                    <div className="py-2 flex items-center justify-between h-[46px]">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleViewModeChange(subMode === 'local' ? 'local' : 'remote')}
                          className={`text-sm font-semibold px-2 py-1 rounded transition-colors ${
                            filesPane === 'changes' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Changes
                        </button>
                        <button
                          onClick={() => handleViewModeChange(subMode === 'local' ? 'all-local' : 'all')}
                          className={`text-sm font-semibold px-2 py-1 rounded transition-colors ${
                            filesPane === 'files' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Files
                        </button>
                      </div>

                      {/* Segment Button for Remote/Sandbox sub-modes */}
                      <div className="inline-flex rounded-md border border-border bg-muted/50 p-0.5">
                        <Button
                          variant={subMode === 'remote' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => handleViewModeChange(filesPane === 'files' ? 'all' : 'remote')}
                          className={`h-6 px-2 text-xs rounded-sm ${
                            subMode === 'remote'
                              ? 'bg-background shadow-sm'
                              : 'hover:bg-transparent hover:text-foreground'
                          }`}
                        >
                          Remote
                        </Button>
                        <Button
                          variant={subMode === 'local' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => handleViewModeChange(filesPane === 'files' ? 'all-local' : 'local')}
                          className={`h-6 px-2 text-xs rounded-sm ${
                            subMode === 'local'
                              ? 'bg-background shadow-sm'
                              : 'hover:bg-transparent hover:text-foreground'
                          }`}
                        >
                          Sandbox
                        </Button>
                      </div>
                    </div>
                  </div>
                </DrawerHeader>
                <div className="overflow-y-auto max-h-[60vh] px-4 pb-4">
                  <FileBrowser
                    taskId={task.id}
                    branchName={task.branchName}
                    repoUrl={task.repoUrl}
                    onFileSelect={(file, isFolder) => {
                      openFileInTab(file, isFolder)
                      if (!isFolder) {
                        setShowFilesList(false)
                      }
                    }}
                    onFilesLoaded={fetchAllDiffs}
                    selectedFile={selectedFile}
                    refreshKey={refreshKey}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    hideHeader={true}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </>
      ) : null}

      {/* Try Again Dialog */}
      <AlertDialog open={showTryAgainDialog} onOpenChange={setShowTryAgainDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Try Again</AlertDialogTitle>
            <AlertDialogDescription>Create a new task with the same prompt and repository.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Agent</label>
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
                <label className="text-sm font-medium mb-2 block">Model</label>
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

            {/* Task Options */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Task Options</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="try-again-install-deps"
                    checked={tryAgainInstallDeps}
                    onCheckedChange={(checked) => setTryAgainInstallDeps(!!checked)}
                  />
                  <Label
                    htmlFor="try-again-install-deps"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Install Dependencies?
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="try-again-max-duration" className="text-sm font-medium">
                    Maximum Duration
                  </Label>
                  <Select
                    value={tryAgainMaxDuration.toString()}
                    onValueChange={(value) => setTryAgainMaxDuration(parseInt(value))}
                  >
                    <SelectTrigger id="try-again-max-duration" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="180">3 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                      <SelectItem value="300">5 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="try-again-keep-alive"
                    checked={tryAgainKeepAlive}
                    onCheckedChange={(checked) => setTryAgainKeepAlive(!!checked)}
                  />
                  <Label
                    htmlFor="try-again-keep-alive"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Keep Alive ({maxSandboxDuration} minutes max)
                  </Label>
                </div>
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
        defaultTitle={(task.title || task.prompt).slice(0, 255)}
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

      {/* Close Tab Confirmation Dialog */}
      <AlertDialog open={showCloseTabDialog} onOpenChange={setShowCloseTabDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to save the changes you made to{' '}
              {tabToClose !== null
                ? (() => {
                    const currentTabs = openTabsByMode[viewMode]
                    const filename = currentTabs[tabToClose]
                    if (!filename) return 'this file'
                    const shortName = filename.split('/').pop()
                    return shortName
                  })()
                : 'this file'}
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowCloseTabDialog(false)
                setTabToClose(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={() => handleCloseTabConfirm(false)}>
              Don&apos;t Save
            </Button>
            <AlertDialogAction onClick={() => handleCloseTabConfirm(true)}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
