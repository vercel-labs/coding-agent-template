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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { User, Calendar, MessageSquare, MoreVertical, ListTodo } from 'lucide-react'
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

function getContrastColor(hexColor: string): string {
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(0, 2), 16)
  const g = parseInt(hexColor.slice(2, 4), 16)
  const b = parseInt(hexColor.slice(4, 6), 16)

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? '#000' : '#fff'
}

interface Issue {
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
  comments: number
  body?: string
  labels: {
    name: string
    color: string
  }[]
}

interface RepoIssuesProps {
  owner: string
  repo: string
}

export function RepoIssues({ owner, repo }: RepoIssuesProps) {
  const router = useRouter()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [installDeps, setInstallDeps] = useState(false)
  const [maxDuration, setMaxDuration] = useState(300)
  const [keepAlive, setKeepAlive] = useState(false)
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  useEffect(() => {
    async function fetchIssues() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/repos/${owner}/${repo}/issues`)
        if (!response.ok) {
          throw new Error('Failed to fetch issues')
        }
        const data = await response.json()
        setIssues(data.issues || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load issues')
      } finally {
        setLoading(false)
      }
    }

    fetchIssues()
  }, [owner, repo])

  useEffect(() => {
    const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
    const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
    if (agentModels && !agentModels.find((m) => m.value === selectedModel)) {
      setSelectedModel(defaultModel)
    }
  }, [selectedAgent, selectedModel])

  const handleCreateTaskFromIssue = (issue: Issue) => {
    setSelectedIssue(issue)
    setShowCreateTaskDialog(true)
  }

  const handleCreateTask = async () => {
    if (!selectedIssue) return

    setIsCreatingTask(true)
    try {
      const repoUrl = `https://github.com/${owner}/${repo}`
      const prompt = `Fix issue #${selectedIssue.number}: ${selectedIssue.title}${selectedIssue.body ? `\n\n${selectedIssue.body}` : ''}`

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-muted-foreground">Loading issues...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Issues</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
          <p className="text-sm text-muted-foreground">This repository has no open issues.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 pb-6">
        {issues.map((issue) => (
          <Card key={issue.number} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <img
                src={issue.user.avatar_url}
                alt={issue.user.login}
                className="h-10 w-10 rounded-full flex-shrink-0"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="block">
                      <p className="font-medium text-sm leading-tight mb-1">
                        {issue.title} <span className="text-muted-foreground">#{issue.number}</span>
                      </p>
                    </a>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {issue.user.login}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(issue.created_at))}
                      </span>
                      {issue.comments > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {issue.comments}
                        </span>
                      )}
                      {issue.labels.length > 0 && (
                        <span className="flex items-center gap-1">
                          {issue.labels.map((label) => (
                            <Badge
                              key={label.name}
                              className="text-[10px] border-0 px-1.5 py-0"
                              style={{
                                backgroundColor: `#${label.color}`,
                                color: getContrastColor(label.color),
                              }}
                            >
                              {label.name}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleCreateTaskFromIssue(issue)}>
                          <ListTodo className="h-4 w-4 mr-2" />
                          Create Task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create Task Dialog */}
      <AlertDialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Task from Issue</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new task to fix issue #{selectedIssue?.number}: {selectedIssue?.title}
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
    </>
  )
}
