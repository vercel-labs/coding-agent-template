'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { GitPullRequest, Calendar, MessageSquare, MoreHorizontal, X, ListTodo } from 'lucide-react'
import { toast } from 'sonner'
import Claude from '@/components/logos/claude'
import Codex from '@/components/logos/codex'
import Copilot from '@/components/logos/copilot'
import Cursor from '@/components/logos/cursor'
import Gemini from '@/components/logos/gemini'
import OpenCode from '@/components/logos/opencode'

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
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 nano' },
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

function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`
  return `${Math.floor(diffInSeconds / 31536000)} years ago`
}

interface PullRequest {
  number: number
  title: string
  state: 'open' | 'closed'
  user: {
    login: string
    avatar_url: string
  }
  created_at: string
  updated_at: string
  html_url: string
  draft: boolean
  comments: number
  merged_at: string | null
  body?: string
}

interface RepoPullRequestsProps {
  owner: string
  repo: string
}

export function RepoPullRequests({ owner, repo }: RepoPullRequestsProps) {
  const router = useRouter()
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closingPR, setClosingPR] = useState<number | null>(null)
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null)
  const [prToClose, setPrToClose] = useState<number | null>(null)
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [installDeps, setInstallDeps] = useState(false)
  const [maxDuration, setMaxDuration] = useState(300)
  const [keepAlive, setKeepAlive] = useState(false)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [prTaskStatus, setPrTaskStatus] = useState<Record<number, { hasTask: boolean; taskId: string | null }>>({})

  useEffect(() => {
    async function fetchPullRequests() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/repos/${owner}/${repo}/pull-requests`)
        if (!response.ok) {
          throw new Error('Failed to fetch pull requests')
        }
        const data = await response.json()
        setPullRequests(data.pullRequests || [])

        // Check task status for each PR
        const statusChecks = await Promise.all(
          data.pullRequests.map(async (pr: PullRequest) => {
            try {
              const taskResponse = await fetch(`/api/repos/${owner}/${repo}/pull-requests/${pr.number}/check-task`)
              if (taskResponse.ok) {
                const taskData = await taskResponse.json()
                return { prNumber: pr.number, hasTask: taskData.hasTask, taskId: taskData.taskId }
              }
            } catch {
              // Silently fail
            }
            return { prNumber: pr.number, hasTask: false, taskId: null }
          }),
        )

        const statusMap: Record<number, { hasTask: boolean; taskId: string | null }> = {}
        statusChecks.forEach((check) => {
          statusMap[check.prNumber] = { hasTask: check.hasTask, taskId: check.taskId }
        })
        setPrTaskStatus(statusMap)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pull requests')
      } finally {
        setLoading(false)
      }
    }

    fetchPullRequests()
  }, [owner, repo])

  useEffect(() => {
    const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
    const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
    if (agentModels && !agentModels.find((m) => m.value === selectedModel)) {
      setSelectedModel(defaultModel)
    }
  }, [selectedAgent, selectedModel])

  const handleCreateTaskFromPR = (pr: PullRequest) => {
    setSelectedPR(pr)
    setShowCreateTaskDialog(true)
  }

  const handleCreateTask = async () => {
    if (!selectedPR) return

    setIsCreatingTask(true)
    try {
      const repoUrl = `https://github.com/${owner}/${repo}`
      const prompt = `Work on PR #${selectedPR.number}: ${selectedPR.title}${selectedPR.body ? `\n\n${selectedPR.body}` : ''}`

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          repoUrl,
          selectedAgent,
          selectedModel,
          installDependencies: installDeps,
          maxDuration,
          keepAlive,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        toast.success('Task created successfully!')
        setShowCreateTaskDialog(false)
        router.push(`/tasks/${result.task.id}`)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create task')
      }
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Failed to create task')
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleClosePR = (prNumber: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPrToClose(prNumber)
    setShowCloseDialog(true)
  }

  const confirmClosePR = async () => {
    if (!prToClose) return

    try {
      setClosingPR(prToClose)
      const response = await fetch(`/api/repos/${owner}/${repo}/pull-requests/${prToClose}/close`, {
        method: 'PATCH',
      })

      if (!response.ok) {
        throw new Error('Failed to close pull request')
      }

      // Remove the closed PR from the list
      setPullRequests((prev) => prev.filter((pr) => pr.number !== prToClose))
      toast.success('Pull request closed successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close pull request')
    } finally {
      setShowCloseDialog(false)
      setClosingPR(null)
      setPrToClose(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-muted-foreground">Loading pull requests...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Pull Requests</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (pullRequests.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <GitPullRequest className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Pull Requests Found</h3>
          <p className="text-sm text-muted-foreground">This repository has no open pull requests.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 pb-6">
        {pullRequests.map((pr) => (
          <Card key={pr.number} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <a
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 flex-1 min-w-0"
              >
                <div className="flex-shrink-0 mt-1">
                  <GitPullRequest
                    className={`h-5 w-5 ${
                      pr.merged_at ? 'text-purple-500' : pr.state === 'open' ? 'text-green-500' : 'text-red-500'
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight mb-1">{pr.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>#{pr.number}</span>
                        <span>•</span>
                        <span>
                          {pr.state === 'open' ? 'opened' : pr.merged_at ? 'merged' : 'closed'}{' '}
                          {formatDistanceToNow(new Date(pr.created_at))}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {pr.draft && (
                        <Badge variant="secondary" className="text-xs">
                          Draft
                        </Badge>
                      )}
                      <Badge
                        variant={pr.merged_at ? 'default' : pr.state === 'open' ? 'default' : 'secondary'}
                        className={`text-xs ${
                          pr.merged_at
                            ? 'bg-purple-500 hover:bg-purple-600'
                            : pr.state === 'open'
                              ? 'bg-green-500 hover:bg-green-600'
                              : ''
                        }`}
                      >
                        {pr.merged_at ? 'Merged' : pr.state === 'open' ? 'Open' : 'Closed'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <img src={pr.user.avatar_url} alt={pr.user.login} className="h-4 w-4 rounded-full" />
                      {pr.user.login}
                    </span>
                    {pr.comments > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {pr.comments}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Updated {formatDistanceToNow(new Date(pr.updated_at))}
                    </span>
                  </div>
                </div>
              </a>

              {pr.state === 'open' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 flex-shrink-0"
                      disabled={closingPR === pr.number}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {!prTaskStatus[pr.number]?.hasTask && (
                      <DropdownMenuItem onClick={() => handleCreateTaskFromPR(pr)}>
                        <ListTodo className="mr-2 h-4 w-4" />
                        Create Task
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={(e) => handleClosePR(pr.number, e)}
                      disabled={closingPR === pr.number}
                      className="text-red-600 dark:text-red-400"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {closingPR === pr.number ? 'Closing...' : 'Close PR'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Create Task Dialog */}
      <AlertDialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Task from Pull Request</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new task to work on PR #{selectedPR?.number}: {selectedPR?.title}
            </AlertDialogDescription>
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
                    id="install-deps"
                    checked={installDeps}
                    onCheckedChange={(checked) => setInstallDeps(!!checked)}
                  />
                  <Label
                    htmlFor="install-deps"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Install Dependencies?
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-duration" className="text-sm font-medium">
                    Maximum Duration
                  </Label>
                  <Select value={maxDuration.toString()} onValueChange={(value) => setMaxDuration(parseInt(value))}>
                    <SelectTrigger id="max-duration" className="w-full">
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
                    id="keep-alive"
                    checked={keepAlive}
                    onCheckedChange={(checked) => setKeepAlive(!!checked)}
                  />
                  <Label
                    htmlFor="keep-alive"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Keep Alive (300 minutes max)
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateTask} disabled={isCreatingTask}>
              {isCreatingTask ? 'Creating...' : 'Create Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close PR Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Pull Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to close PR #{prToClose}? This action can be reversed later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)} disabled={closingPR !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmClosePR} disabled={closingPR !== null}>
              {closingPR !== null ? 'Closing...' : 'Close PR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
