'use client'

import type { Task } from '@/lib/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Plus, Trash2, GitBranch, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useTasks } from '@/components/app-layout'
import { useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { PRStatusIcon } from '@/components/pr-status-icon'
import { PRCheckStatus } from '@/components/pr-check-status'
import { githubConnectionAtom } from '@/lib/atoms/github-connection'

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
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'opus-4.1', label: 'Opus 4.1' },
    { value: 'grok', label: 'Grok' },
  ],
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
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

interface TaskSidebarProps {
  tasks: Task[]
  width?: number
}

type TabType = 'tasks' | 'repos'

interface GitHubRepoInfo {
  name: string
  full_name: string
  owner: string
  description?: string
  private: boolean
  clone_url: string
  updated_at: string
  language?: string
}

export function TaskSidebar({ tasks, width = 288 }: TaskSidebarProps) {
  const pathname = usePathname()
  const { refreshTasks, toggleSidebar } = useTasks()
  const session = useAtomValue(sessionAtom)
  const githubConnection = useAtomValue(githubConnectionAtom)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteCompleted, setDeleteCompleted] = useState(true)
  const [deleteFailed, setDeleteFailed] = useState(true)
  const [deleteStopped, setDeleteStopped] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('tasks')

  // State for repos from API
  const [repos, setRepos] = useState<GitHubRepoInfo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposPage, setReposPage] = useState(1)
  const [hasMoreRepos, setHasMoreRepos] = useState(true)
  const [reposInitialized, setReposInitialized] = useState(false)
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GitHubRepoInfo[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchPage, setSearchPage] = useState(1)
  const [searchHasMore, setSearchHasMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Close sidebar on mobile when clicking any link
  const handleLinkClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      toggleSidebar()
    }
  }

  // Extract task counts per repo from tasks
  const taskCountByRepo = useMemo(() => {
    const counts = new Map<string, number>()

    tasks.forEach((task) => {
      if (task.repoUrl) {
        try {
          const url = new URL(task.repoUrl)
          const pathParts = url.pathname.split('/').filter(Boolean)
          if (pathParts.length >= 2) {
            const owner = pathParts[0]
            const name = pathParts[1].replace(/\.git$/, '')
            const repoKey = `${owner}/${name}`
            counts.set(repoKey, (counts.get(repoKey) || 0) + 1)
          }
        } catch {
          // Invalid URL, skip
        }
      }
    })

    return counts
  }, [tasks])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(repoSearchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [repoSearchQuery])

  // Fetch search results when debounced query changes
  const fetchSearchResults = useCallback(async (query: string, page: number, append: boolean = false) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchHasMore(false)
      return
    }

    setSearchLoading(true)
    try {
      const response = await fetch(
        `/api/github/user-repos?page=${page}&per_page=25&search=${encodeURIComponent(query)}`,
      )

      if (!response.ok) {
        throw new Error('Failed to search repos')
      }

      const data = await response.json()

      if (append) {
        setSearchResults((prev) => [...prev, ...data.repos])
      } else {
        setSearchResults(data.repos)
      }

      setSearchHasMore(data.has_more)
      setSearchPage(page)
    } catch (error) {
      console.error('Error searching repos:', error)
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Fetch search results when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      fetchSearchResults(debouncedSearchQuery, 1)
    } else {
      setSearchResults([])
      setSearchHasMore(false)
    }
  }, [debouncedSearchQuery, fetchSearchResults])

  // Get the repos to display (search results or regular repos)
  const displayedRepos = debouncedSearchQuery.trim() ? searchResults : repos
  const displayedHasMore = debouncedSearchQuery.trim() ? searchHasMore : hasMoreRepos
  const isSearching = debouncedSearchQuery.trim().length > 0

  // Fetch repos from API
  const fetchRepos = useCallback(
    async (page: number, append: boolean = false) => {
      if (reposLoading) return

      setReposLoading(true)
      try {
        const response = await fetch(`/api/github/user-repos?page=${page}&per_page=25`)

        if (!response.ok) {
          throw new Error('Failed to fetch repos')
        }

        const data = await response.json()

        if (append) {
          setRepos((prev) => [...prev, ...data.repos])
        } else {
          setRepos(data.repos)
        }

        setHasMoreRepos(data.has_more)
        setReposPage(page)
        setReposInitialized(true)
      } catch (error) {
        console.error('Error fetching repos:', error)
      } finally {
        setReposLoading(false)
      }
    },
    [reposLoading],
  )

  // Load repos when switching to repos tab or when GitHub is connected
  useEffect(() => {
    if (activeTab === 'repos' && session.user && githubConnection.connected && !reposInitialized && !reposLoading) {
      fetchRepos(1)
    }
  }, [activeTab, session.user, githubConnection.connected, reposInitialized, reposLoading, fetchRepos])

  // Reset repos when GitHub connection changes
  useEffect(() => {
    if (!githubConnection.connected) {
      setRepos([])
      setReposPage(1)
      setHasMoreRepos(true)
      setReposInitialized(false)
    }
  }, [githubConnection.connected])

  // Infinite scroll observer
  useEffect(() => {
    const isLoading = isSearching ? searchLoading : reposLoading
    const hasMore = displayedHasMore

    if (activeTab !== 'repos' || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          if (isSearching) {
            fetchSearchResults(debouncedSearchQuery, searchPage + 1, true)
          } else {
            fetchRepos(reposPage + 1, true)
          }
        }
      },
      { threshold: 0.1 },
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [
    activeTab,
    displayedHasMore,
    reposLoading,
    searchLoading,
    reposPage,
    searchPage,
    isSearching,
    debouncedSearchQuery,
    fetchRepos,
    fetchSearchResults,
  ])

  const handleDeleteTasks = async () => {
    if (!deleteCompleted && !deleteFailed && !deleteStopped) {
      toast.error('Please select at least one task type to delete')
      return
    }

    setIsDeleting(true)
    try {
      const actions = []
      if (deleteCompleted) actions.push('completed')
      if (deleteFailed) actions.push('failed')
      if (deleteStopped) actions.push('stopped')

      const response = await fetch(`/api/tasks?action=${actions.join(',')}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(result.message)
        await refreshTasks()
        setShowDeleteDialog(false)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete tasks')
      }
    } catch (error) {
      console.error('Error deleting tasks:', error)
      toast.error('Failed to delete tasks')
    } finally {
      setIsDeleting(false)
    }
  }

  const getHumanFriendlyModelName = (agent: string | null, model: string | null) => {
    if (!agent || !model) return model

    const agentModels = AGENT_MODELS[agent as keyof typeof AGENT_MODELS]
    if (!agentModels) return model

    const modelInfo = agentModels.find((m) => m.value === model)
    return modelInfo ? modelInfo.label : model
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

  // Show logged out state if no user is authenticated
  if (!session.user) {
    return (
      <div
        className="h-full border-r bg-muted px-2 md:px-3 pt-3 md:pt-5.5 pb-3 md:pb-4 overflow-y-auto flex flex-col"
        style={{ width: `${width}px` }}
      >
        <div className="mb-3 md:mb-4">
          <div className="flex items-center justify-between mb-2">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('tasks')}
                className={cn(
                  'text-xs font-medium tracking-wide transition-colors px-2 py-1 rounded',
                  activeTab === 'tasks'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                Tasks
              </button>
              <button
                onClick={() => setActiveTab('repos')}
                className={cn(
                  'text-xs font-medium tracking-wide transition-colors px-2 py-1 rounded',
                  activeTab === 'repos'
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                Repos
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowDeleteDialog(true)}
                disabled={true}
                title="Delete Tasks"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Link href="/" onClick={handleLinkClick}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="New Task">
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {activeTab === 'tasks' && (
            <Card>
              <CardContent className="p-3 text-center text-xs text-muted-foreground">
                Sign in to view and create tasks
              </CardContent>
            </Card>
          )}
          {activeTab === 'repos' && (
            <Card>
              <CardContent className="p-3 text-center text-xs text-muted-foreground">
                Sign in to view repositories
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full border-r bg-muted px-2 md:px-3 pt-3 md:pt-5.5 pb-3 md:pb-4 overflow-y-auto"
      style={{ width: `${width}px` }}
    >
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between mb-2">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('tasks')}
              className={cn(
                'text-xs font-medium tracking-wide transition-colors px-2 py-1 rounded',
                activeTab === 'tasks'
                  ? 'text-foreground bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              Tasks
            </button>
            <button
              onClick={() => setActiveTab('repos')}
              className={cn(
                'text-xs font-medium tracking-wide transition-colors px-2 py-1 rounded',
                activeTab === 'repos'
                  ? 'text-foreground bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              Repos
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting || tasks.length === 0}
              title="Delete Tasks"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Link href="/" onClick={handleLinkClick}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="New Task">
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tasks Tab Content */}
      {activeTab === 'tasks' && (
        <div className="space-y-1">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="p-3 text-center text-xs text-muted-foreground">
                No tasks yet. Create your first task!
              </CardContent>
            </Card>
          ) : (
            <>
              {tasks.slice(0, 10).map((task) => {
                const isActive = pathname === `/tasks/${task.id}`

                return (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    onClick={handleLinkClick}
                    className={cn('block rounded-lg', isActive && 'ring-1 ring-primary/50 ring-offset-0')}
                  >
                    <Card
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-accent p-0 rounded-lg',
                        isActive && 'bg-accent',
                      )}
                    >
                      <CardContent className="px-3 py-2">
                        <div className="flex gap-2">
                          {/* Text content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h3
                                className={cn(
                                  'text-xs font-medium truncate mb-0.5',
                                  task.status === 'processing' &&
                                    'bg-gradient-to-r from-muted-foreground from-20% via-white via-50% to-muted-foreground to-80% bg-clip-text text-transparent bg-[length:300%_100%] animate-[shimmer_1.5s_linear_infinite]',
                                )}
                              >
                                {(() => {
                                  const displayText = task.title || task.prompt
                                  return displayText.slice(0, 50) + (displayText.length > 50 ? '...' : '')
                                })()}
                              </h3>
                              {task.status === 'error' && (
                                <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                              )}
                              {task.status === 'stopped' && (
                                <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                              )}
                            </div>
                            {task.repoUrl && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                                {task.prStatus && (
                                  <div className="relative">
                                    <PRStatusIcon status={task.prStatus} />
                                    <PRCheckStatus taskId={task.id} prStatus={task.prStatus} isActive={isActive} />
                                  </div>
                                )}
                                <span className="truncate">
                                  {(() => {
                                    try {
                                      const url = new URL(task.repoUrl)
                                      const pathParts = url.pathname.split('/').filter(Boolean)
                                      if (pathParts.length >= 2) {
                                        return `${pathParts[0]}/${pathParts[1].replace(/\.git$/, '')}`
                                      } else {
                                        return 'Unknown repository'
                                      }
                                    } catch {
                                      return 'Invalid repository URL'
                                    }
                                  })()}
                                </span>
                              </div>
                            )}
                            {task.selectedAgent && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {(() => {
                                  const AgentLogo = getAgentLogo(task.selectedAgent)
                                  return AgentLogo ? <AgentLogo className="w-3 h-3" /> : null
                                })()}
                                {task.selectedModel && (
                                  <span className="truncate">
                                    {getHumanFriendlyModelName(task.selectedAgent, task.selectedModel)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
              {tasks.length >= 1 && (
                <div className="pt-1">
                  <Link href="/tasks" onClick={handleLinkClick}>
                    <Button variant="ghost" size="sm" className="w-full justify-start h-7 px-2 text-xs">
                      View All Tasks
                    </Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Repos Tab Content */}
      {activeTab === 'repos' && (
        <div className="space-y-2">
          {/* Search input */}
          {githubConnection.connected && (repos.length > 0 || repoSearchQuery) && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search repos..."
                value={repoSearchQuery}
                onChange={(e) => setRepoSearchQuery(e.target.value)}
                className="h-8 pl-7 pr-7 text-xs"
              />
              {repoSearchQuery && (
                <button
                  onClick={() => setRepoSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <div className="space-y-1">
            {!githubConnection.connected ? (
              <Card>
                <CardContent className="p-3 text-center text-xs text-muted-foreground">
                  Connect GitHub to view your repositories
                </CardContent>
              </Card>
            ) : (reposLoading && repos.length === 0 && !isSearching) ||
              (searchLoading && searchResults.length === 0 && isSearching) ? (
              <Card>
                <CardContent className="p-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {isSearching ? 'Searching...' : 'Loading repositories...'}
                </CardContent>
              </Card>
            ) : displayedRepos.length === 0 && !isSearching ? (
              <Card>
                <CardContent className="p-3 text-center text-xs text-muted-foreground">
                  No repositories found
                </CardContent>
              </Card>
            ) : displayedRepos.length === 0 && isSearching && !searchLoading ? (
              <Card>
                <CardContent className="p-3 text-center text-xs text-muted-foreground">
                  No repos match &quot;{repoSearchQuery}&quot;
                </CardContent>
              </Card>
            ) : (
              <>
                {displayedRepos.map((repo) => {
                  const repoPath = `/repos/${repo.owner}/${repo.name}`
                  const isActive = pathname === repoPath || pathname.startsWith(repoPath + '/')
                  const repoKey = `${repo.owner}/${repo.name}`
                  const taskCount = taskCountByRepo.get(repoKey) || 0

                  return (
                    <Link
                      key={repoKey}
                      href={repoPath}
                      onClick={handleLinkClick}
                      className={cn('block rounded-lg', isActive && 'ring-1 ring-primary/50 ring-offset-0')}
                    >
                      <Card
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-accent p-0 rounded-lg',
                          isActive && 'bg-accent',
                        )}
                      >
                        <CardContent className="px-3 py-2">
                          <div className="flex gap-2 items-center">
                            <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xs font-medium truncate mb-0.5">
                                {repo.owner}/{repo.name}
                              </h3>
                              {taskCount > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                                </div>
                              )}
                            </div>
                            {repo.private && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                Private
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
                {/* Load more trigger */}
                {displayedHasMore && (
                  <div ref={loadMoreRef} className="py-2 flex justify-center">
                    {(isSearching ? searchLoading : reposLoading) && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tasks</AlertDialogTitle>
            <AlertDialogDescription>
              Select which types of tasks you want to delete. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-completed"
                  checked={deleteCompleted}
                  onCheckedChange={(checked) => setDeleteCompleted(checked === true)}
                />
                <label
                  htmlFor="delete-completed"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Completed Tasks
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-failed"
                  checked={deleteFailed}
                  onCheckedChange={(checked) => setDeleteFailed(checked === true)}
                />
                <label
                  htmlFor="delete-failed"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Failed Tasks
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-stopped"
                  checked={deleteStopped}
                  onCheckedChange={(checked) => setDeleteStopped(checked === true)}
                />
                <label
                  htmlFor="delete-stopped"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Stopped Tasks
                </label>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTasks}
              disabled={isDeleting || (!deleteCompleted && !deleteFailed && !deleteStopped)}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Tasks'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
