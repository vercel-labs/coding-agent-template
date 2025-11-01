'use client'

import { useState, useEffect, useMemo } from 'react'
import { Task } from '@/lib/db/schema'
import { PageHeader } from '@/components/page-header'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Trash2, Square, StopCircle, CheckSquare, X, Clock } from 'lucide-react'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { User } from '@/components/auth/user'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { Session } from '@/lib/session/types'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { PRStatusIcon } from '@/components/pr-status-icon'
import { PRCheckStatus } from '@/components/pr-check-status'

interface TasksListClientProps {
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
}

// Model mappings for human-friendly names
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

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInMs = now.getTime() - new Date(date).getTime()
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

  if (diffInMinutes < 1) return 'just now'
  if (diffInMinutes === 1) return '1 minute ago'
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`
  if (diffInHours === 1) return '1 hour ago'
  if (diffInHours < 24) return `${diffInHours} hours ago`
  if (diffInDays === 1) return 'yesterday'
  if (diffInDays < 7) return `${diffInDays} days ago`
  return new Date(date).toLocaleDateString()
}

export function TasksListClient({ user, authProvider, initialStars = 1200 }: TasksListClientProps) {
  const { toggleSidebar, refreshTasks } = useTasks()
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks')
      if (response.ok) {
        const data = await response.json()
        setTasks(data.tasks)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
      toast.error('Failed to fetch tasks')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'all') return tasks
    return tasks.filter((task) => task.status === statusFilter)
  }, [tasks, statusFilter])

  const handleSelectAll = () => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(filteredTasks.map((task) => task.id)))
    }
  }

  const handleSelectTask = (taskId: string) => {
    const newSelected = new Set(selectedTasks)
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId)
    } else {
      newSelected.add(taskId)
    }
    setSelectedTasks(newSelected)
  }

  const handleBulkDelete = async () => {
    setIsDeleting(true)
    try {
      const deletePromises = Array.from(selectedTasks).map((taskId) =>
        fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE',
        }),
      )

      const results = await Promise.all(deletePromises)
      const successCount = results.filter((r) => r.ok).length
      const failCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`Successfully deleted ${successCount} task${successCount > 1 ? 's' : ''}`)
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} task${failCount > 1 ? 's' : ''}`)
      }

      setSelectedTasks(new Set())
      setShowDeleteDialog(false)
      await fetchTasks()
      await refreshTasks()
    } catch (error) {
      console.error('Error deleting tasks:', error)
      toast.error('Failed to delete tasks')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkStop = async () => {
    setIsStopping(true)
    try {
      const stopPromises = Array.from(selectedTasks)
        .filter((taskId) => {
          const task = tasks.find((t) => t.id === taskId)
          return task?.status === 'processing'
        })
        .map((taskId) =>
          fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' }),
          }),
        )

      if (stopPromises.length === 0) {
        toast.error('No running tasks selected')
        setShowStopDialog(false)
        setIsStopping(false)
        return
      }

      const results = await Promise.all(stopPromises)
      const successCount = results.filter((r) => r.ok).length
      const failCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`Successfully stopped ${successCount} task${successCount > 1 ? 's' : ''}`)
      }
      if (failCount > 0) {
        toast.error(`Failed to stop ${failCount} task${failCount > 1 ? 's' : ''}`)
      }

      setSelectedTasks(new Set())
      setShowStopDialog(false)
      await fetchTasks()
      await refreshTasks()
    } catch (error) {
      console.error('Error stopping tasks:', error)
      toast.error('Failed to stop tasks')
    } finally {
      setIsStopping(false)
    }
  }

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

  const getHumanFriendlyModelName = (agent: string | null, model: string | null) => {
    if (!agent || !model) return model

    const agentModels = AGENT_MODELS[agent as keyof typeof AGENT_MODELS]
    if (!agentModels) return model

    const modelInfo = agentModels.find((m) => m.value === model)
    return modelInfo ? modelInfo.label : model
  }

  const selectedProcessingTasks = Array.from(selectedTasks).filter((taskId) => {
    const task = tasks.find((t) => t.id === taskId)
    return task?.status === 'processing'
  })

  return (
    <div className="flex-1 bg-background flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <PageHeader
          showMobileMenu={true}
          onToggleMobileMenu={toggleSidebar}
          title="All Tasks"
          actions={
            <div className="flex items-center gap-2 h-8">
              <GitHubStarsButton initialStars={initialStars} />
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 sm:px-3 px-0 sm:w-auto w-8 bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
              >
                <a
                  href={VERCEL_DEPLOY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5"
                >
                  <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
                    <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                  </svg>
                  <span className="hidden sm:inline">Deploy Your Own</span>
                </a>
              </Button>
              <User user={user} authProvider={authProvider} />
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={filteredTasks.length === 0}>
                {selectedTasks.size === filteredTasks.length && filteredTasks.length > 0 ? (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Select All
                  </>
                )}
              </Button>

              {selectedTasks.size > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSelectedTasks(new Set())}>
                    <X className="h-4 w-4 mr-2" />
                    Clear Selection
                  </Button>
                  <span className="text-sm text-muted-foreground">{selectedTasks.size} selected</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tasks</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="error">Failed</SelectItem>
                  <SelectItem value="stopped">Stopped</SelectItem>
                </SelectContent>
              </Select>

              {selectedTasks.size > 0 && (
                <>
                  {selectedProcessingTasks.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowStopDialog(true)}
                      disabled={isStopping}
                      title={`Stop ${selectedProcessingTasks.length} task${selectedProcessingTasks.length > 1 ? 's' : ''}`}
                    >
                      <StopCircle className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isDeleting}
                    title={`Delete ${selectedTasks.size} task${selectedTasks.size > 1 ? 's' : ''}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Tasks List */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">Loading tasks...</div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-muted-foreground">
                  {statusFilter === 'all' ? 'No tasks yet. Create your first task!' : `No ${statusFilter} tasks.`}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <Card
                  key={task.id}
                  className={cn(
                    'transition-colors hover:bg-accent cursor-pointer p-0',
                    selectedTasks.has(task.id) && 'ring-2 ring-primary',
                  )}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                      return
                    }
                    router.push(`/tasks/${task.id}`)
                  }}
                >
                  <CardContent className="px-3 py-2">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedTasks.has(task.id)}
                        onCheckedChange={() => handleSelectTask(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium truncate flex-1">{task.title || task.prompt}</h3>
                          {task.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                          {task.status === 'stopped' && (
                            <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                          )}
                        </div>
                        {task.repoUrl && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            {task.prStatus && (
                              <div className="relative">
                                <PRStatusIcon status={task.prStatus} />
                                <PRCheckStatus taskId={task.id} prStatus={task.prStatus} />
                              </div>
                            )}
                            <span className="truncate">
                              {(() => {
                                try {
                                  const url = new URL(task.repoUrl)
                                  const pathParts = url.pathname.split('/').filter(Boolean)
                                  if (pathParts.length >= 2) {
                                    return `${pathParts[0]}/${pathParts[1].replace(/\.git$/, '')}`
                                  }
                                  return 'Unknown repository'
                                } catch {
                                  return 'Invalid repository URL'
                                }
                              })()}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {task.selectedAgent && (
                            <div className="flex items-center gap-1">
                              {(() => {
                                const AgentLogo = getAgentLogo(task.selectedAgent)
                                return AgentLogo ? <AgentLogo className="w-3 h-3" /> : null
                              })()}
                              {task.selectedModel && (
                                <span>{getHumanFriendlyModelName(task.selectedAgent, task.selectedModel)}</span>
                              )}
                            </div>
                          )}
                          {task.selectedAgent && <span>?</span>}
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{getTimeAgo(task.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Tasks</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedTasks.size} task{selectedTasks.size > 1 ? 's' : ''}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? 'Deleting...' : 'Delete Tasks'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stop Confirmation Dialog */}
      <AlertDialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Running Tasks</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to stop {selectedProcessingTasks.length} running task
              {selectedProcessingTasks.length > 1 ? 's' : ''}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkStop}
              disabled={isStopping}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isStopping ? 'Stopping...' : 'Stop Tasks'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
