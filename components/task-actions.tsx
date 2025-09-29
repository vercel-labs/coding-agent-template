'use client'

import { useState, useEffect } from 'react'
import { Task } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { MoreHorizontal, RotateCcw, Trash2, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { useTasks } from '@/components/app-layout'
import { Claude, Codex, Cursor, OpenCode } from '@/components/logos'

interface TaskActionsProps {
  task: Task
}

const CODING_AGENTS = [
  { value: 'claude', label: 'Claude', icon: Claude },
  { value: 'codex', label: 'Codex', icon: Codex },
  { value: 'cursor', label: 'Cursor', icon: Cursor },
  { value: 'opencode', label: 'opencode', icon: OpenCode },
] as const

// Model options for each agent
const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
  ],
  codex: [
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
  ],
  cursor: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
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

// Default models for each agent
const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  codex: 'openai/gpt-5',
  cursor: 'gpt-5',
  opencode: 'gpt-5',
} as const

export function TaskActions({ task }: TaskActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTryAgainDialog, setShowTryAgainDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTryingAgain, setIsTryingAgain] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(task.selectedAgent || 'claude')
  const [selectedModel, setSelectedModel] = useState<string>(task.selectedModel || DEFAULT_MODELS.claude)
  const router = useRouter()
  const { refreshTasks } = useTasks()

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

  const getPRUrl = () => {
    if (!task.repoUrl || !task.branchName) return null
    const baseUrl = task.repoUrl.replace('.git', '')
    return `${baseUrl}/compare/main...${task.branchName}`
  }

  const handleOpenPR = () => {
    const prUrl = getPRUrl()
    if (prUrl) {
      window.open(prUrl, '_blank', 'noopener,noreferrer')
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

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Deploy to Vercel Button */}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
        >
          <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
            <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
            Deploy to Vercel
          </a>
        </Button>

        {/* More Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {getPRUrl() && (
              <DropdownMenuItem onClick={handleOpenPR}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open PR
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setShowTryAgainDialog(true)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600 focus:text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
    </>
  )
}
