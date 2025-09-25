'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ArrowUp, Lock } from 'lucide-react'
import { Claude, Codex, Cursor, OpenCode } from '@/components/logos'

interface GitHubOwner {
  login: string
  name: string
  avatar_url: string
}

interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
}

interface TaskFormProps {
  onSubmit: (data: { prompt: string; repoUrl: string; selectedAgent: string; selectedModel: string }) => void
  isSubmitting: boolean
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
    { value: 'auto', label: 'Auto' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
  ],
  opencode: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
  ],
} as const

// Default models for each agent
const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-20250514',
  codex: 'openai/gpt-5',
  cursor: 'auto',
  opencode: 'gpt-5',
} as const

export function TaskForm({ onSubmit, isSubmitting }: TaskFormProps) {
  const [prompt, setPrompt] = useState('')
  const [selectedOwner, setSelectedOwner] = useState('')
  const [selectedRepo, setSelectedRepo] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [repoFilter, setRepoFilter] = useState('')
  const [owners, setOwners] = useState<GitHubOwner[]>([])
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loadingOwners, setLoadingOwners] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)

  // Ref for the textarea to focus it programmatically
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Ref for the filter input to focus it when dropdown opens
  const filterInputRef = useRef<HTMLInputElement>(null)

  // Handle container click to focus textarea
  const handleContainerClick = (e: React.MouseEvent) => {
    // Don't focus if clicking on interactive elements
    const target = e.target as HTMLElement
    const isInteractiveElement = target.closest('button, [role="combobox"], [role="option"], input')

    if (!isInteractiveElement && textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  // Handle keyboard events in textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // On desktop: Enter submits, Shift+Enter creates new line
      // On mobile: Enter creates new line, must use submit button
      const isMobile = window.innerWidth < 1024

      if (!isMobile && !e.shiftKey) {
        // Desktop: Enter without Shift submits the form
        e.preventDefault()
        if (prompt.trim() && selectedOwner && selectedRepo) {
          const form = e.currentTarget.closest('form')
          if (form) {
            form.requestSubmit()
          }
        }
      }
      // For all other cases (mobile Enter, desktop Shift+Enter), let default behavior create new line
    }
  }

  // Load saved repo when owner changes
  useEffect(() => {
    if (selectedOwner) {
      const lastUsedRepo = localStorage.getItem(`last-selected-repo-${selectedOwner}`)
      if (lastUsedRepo) {
        setSelectedRepo(lastUsedRepo)
      }
    } else {
      setSelectedRepo('')
    }
  }, [selectedOwner])

  // Restore saved owner selection after owners are loaded
  useEffect(() => {
    if (owners.length > 0 && !selectedOwner) {
      const lastUsedOwner = localStorage.getItem('last-selected-owner')
      if (lastUsedOwner && owners.some((owner) => owner.login === lastUsedOwner)) {
        setSelectedOwner(lastUsedOwner)
      }
    }
  }, [owners, selectedOwner])

  // Fetch user and organizations on mount
  useEffect(() => {
    const fetchOwners = async () => {
      try {
        // Check cache first
        const cachedOwners = sessionStorage.getItem('github-owners')
        if (cachedOwners) {
          try {
            const parsedOwners = JSON.parse(cachedOwners)
            // Sort owners by login name
            const sortedOwners = parsedOwners.sort((a: GitHubOwner, b: GitHubOwner) =>
              a.login.localeCompare(b.login, undefined, { sensitivity: 'base' }),
            )
            setOwners(sortedOwners)
            setLoadingOwners(false)

            // Owner selection will be handled by the useEffect that watches owners array
            return
          } catch {
            console.warn('Failed to parse cached owners, fetching fresh data')
            sessionStorage.removeItem('github-owners')
          }
        }

        const [userResponse, orgsResponse] = await Promise.all([fetch('/api/github/user'), fetch('/api/github/orgs')])

        const ownersList: GitHubOwner[] = []

        if (userResponse.ok) {
          const user = await userResponse.json()
          ownersList.push(user)
        }

        if (orgsResponse.ok) {
          const orgs = await orgsResponse.json()
          ownersList.push(...orgs)
        }

        // Sort owners by login name
        const sortedOwnersList = ownersList.sort((a, b) =>
          a.login.localeCompare(b.login, undefined, { sensitivity: 'base' }),
        )

        setOwners(sortedOwnersList)

        // Cache the results
        sessionStorage.setItem('github-owners', JSON.stringify(sortedOwnersList))

        // Owner selection will be handled by the useEffect that watches owners array
      } catch (error) {
        console.error('Error fetching owners:', error)
      } finally {
        setLoadingOwners(false)
      }
    }

    fetchOwners()
  }, [])

  // Load saved prompt, agent, and model on mount, and focus the prompt input
  useEffect(() => {
    const savedPrompt = localStorage.getItem('task-prompt')
    if (savedPrompt) {
      setPrompt(savedPrompt)
    }

    const savedAgent = localStorage.getItem('last-selected-agent')
    if (savedAgent && CODING_AGENTS.some((agent) => agent.value === savedAgent)) {
      setSelectedAgent(savedAgent)

      // Load saved model for this agent
      const savedModel = localStorage.getItem(`last-selected-model-${savedAgent}`)
      const agentModels = AGENT_MODELS[savedAgent as keyof typeof AGENT_MODELS]
      if (savedModel && agentModels?.some((model) => model.value === savedModel)) {
        setSelectedModel(savedModel)
      } else {
        const defaultModel = DEFAULT_MODELS[savedAgent as keyof typeof DEFAULT_MODELS]
        if (defaultModel) {
          setSelectedModel(defaultModel)
        }
      }
    }

    // Focus the prompt input when the component mounts
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Save prompt to localStorage whenever it changes
  useEffect(() => {
    if (prompt) {
      localStorage.setItem('task-prompt', prompt)
    } else {
      localStorage.removeItem('task-prompt')
    }
  }, [prompt])

  // Update model when agent changes
  useEffect(() => {
    if (selectedAgent) {
      // Load saved model for this agent or use default
      const savedModel = localStorage.getItem(`last-selected-model-${selectedAgent}`)
      const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
      if (savedModel && agentModels?.some((model) => model.value === savedModel)) {
        setSelectedModel(savedModel)
      } else {
        const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
        if (defaultModel) {
          setSelectedModel(defaultModel)
        }
      }
    }
  }, [selectedAgent])

  // Focus filter input when repo dropdown opens
  useEffect(() => {
    if (repoDropdownOpen && filterInputRef.current && selectedOwner && repos.length > 0) {
      // Small delay to ensure the dropdown is fully rendered
      setTimeout(() => {
        filterInputRef.current?.focus()
      }, 100)
    }
  }, [repoDropdownOpen, selectedOwner, repos.length])

  // Fetch repositories when owner changes
  useEffect(() => {
    if (!selectedOwner) {
      setRepos([])
      setSelectedRepo('')
      setRepoFilter('')
      return
    }

    const fetchRepos = async (forceRefresh = false) => {
      if (!forceRefresh) {
        setLoadingRepos(true)
      }
      try {
        // Check cache first
        const cacheKey = `github-repos-${selectedOwner}`
        const cacheTimestampKey = `github-repos-timestamp-${selectedOwner}`
        const cachedRepos = sessionStorage.getItem(cacheKey)
        const cachedTimestamp = sessionStorage.getItem(cacheTimestampKey)

        if (cachedRepos && cachedTimestamp && !forceRefresh) {
          try {
            const parsedRepos = JSON.parse(cachedRepos)
            const timestamp = parseInt(cachedTimestamp)
            const now = Date.now()
            const tenMinutesInMs = 10 * 60 * 1000 // 10 minutes

            // Use cached data immediately
            setRepos(parsedRepos)
            setLoadingRepos(false)

            // Auto-select last used repo for this owner
            const lastUsedRepo = localStorage.getItem(`last-selected-repo-${selectedOwner}`)
            if (lastUsedRepo && parsedRepos.some((repo: GitHubRepo) => repo.name === lastUsedRepo)) {
              setSelectedRepo(lastUsedRepo)
            }

            // Check if cache is older than 10 minutes and refresh in background
            if (now - timestamp > tenMinutesInMs) {
              console.log(`Cache for ${selectedOwner} is older than 10 minutes, refreshing in background`)
              // Refresh in background without showing loading state
              fetchRepos(true)
            }
            return
          } catch {
            console.warn(`Failed to parse cached repos for ${selectedOwner}, fetching fresh data`)
            sessionStorage.removeItem(cacheKey)
            sessionStorage.removeItem(cacheTimestampKey)
          }
        }

        const response = await fetch(`/api/github/repos?owner=${selectedOwner}`)
        if (response.ok) {
          const reposList = await response.json()
          setRepos(reposList)

          // Cache the results with timestamp
          sessionStorage.setItem(cacheKey, JSON.stringify(reposList))
          sessionStorage.setItem(cacheTimestampKey, Date.now().toString())

          // Auto-select last used repo for this owner (only if not a background refresh)
          if (!forceRefresh) {
            const lastUsedRepo = localStorage.getItem(`last-selected-repo-${selectedOwner}`)
            if (lastUsedRepo && reposList.some((repo: GitHubRepo) => repo.name === lastUsedRepo)) {
              setSelectedRepo(lastUsedRepo)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching repositories:', error)
      } finally {
        if (!forceRefresh) {
          setLoadingRepos(false)
        }
      }
    }

    fetchRepos()
  }, [selectedOwner])

  // Filter repositories based on search term
  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(repoFilter.toLowerCase())),
  )

  // Limit to 50 repos if no filter is applied, otherwise show all filtered results
  const displayedRepos = repoFilter ? filteredRepos : filteredRepos.slice(0, 50)
  const hasMoreRepos = !repoFilter && repos.length > 50

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim() && selectedOwner && selectedRepo) {
      const selectedRepoData = repos.find((repo) => repo.name === selectedRepo)
      if (selectedRepoData) {
        // Clear the saved prompt since we're submitting it
        localStorage.removeItem('task-prompt')

        onSubmit({
          prompt: prompt.trim(),
          repoUrl: selectedRepoData.clone_url,
          selectedAgent,
          selectedModel,
        })
      }
    }
  }

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-3">Coding Agent Template</h1>
        <p className="text-muted-foreground text-xl mb-2 max-w-3xl mx-auto">
          Multi-agent AI coding platform powered by{' '}
          <a
            href="https://vercel.com/docs/vercel-sandbox"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Vercel Sandbox
          </a>{' '}
          and{' '}
          <a
            href="https://vercel.com/docs/ai-gateway"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            AI Gateway
          </a>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          className="relative border rounded-2xl shadow-sm overflow-hidden bg-muted/30 cursor-text"
          onClick={handleContainerClick}
        >
          {/* Prompt Input */}
          <div className="relative bg-transparent">
            <Textarea
              ref={textareaRef}
              id="prompt"
              placeholder="Describe what you want the AI agent to do..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isSubmitting}
              required
              rows={4}
              className="w-full border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 p-4 text-base !bg-transparent"
            />
          </div>

          {/* Repository and Agent Selection */}
          <div className="p-4">
            {/* Mobile: Two-line layout */}
            <div className="flex flex-col gap-3 lg:hidden">
              {/* Repository Selection Row */}
              <div className="flex items-center gap-2">
                <Select
                  value={selectedOwner}
                  onValueChange={(value) => {
                    setSelectedOwner(value)
                    setSelectedRepo('') // Reset repo when owner changes
                    setRepoFilter('') // Reset filter when owner changes
                    // Save to localStorage immediately
                    localStorage.setItem('last-selected-owner', value)
                  }}
                  disabled={isSubmitting || loadingOwners}
                >
                  <SelectTrigger className="w-auto min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                    <SelectValue placeholder={loadingOwners ? 'Loading...' : 'Owner'} />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.login} value={owner.login}>
                        <div className="flex items-center gap-2">
                          <Image
                            src={owner.avatar_url}
                            alt={owner.login}
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded-full"
                          />
                          <span>{owner.login}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-muted-foreground">/</span>

                <Select
                  value={selectedRepo}
                  onValueChange={(value) => {
                    setSelectedRepo(value)
                    // Save to localStorage immediately
                    if (selectedOwner) {
                      localStorage.setItem(`last-selected-repo-${selectedOwner}`, value)
                    }
                  }}
                  disabled={isSubmitting || !selectedOwner || loadingRepos}
                  onOpenChange={setRepoDropdownOpen}
                >
                  <SelectTrigger className="w-auto min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                    <SelectValue
                      placeholder={!selectedOwner ? 'Select owner first' : loadingRepos ? 'Loading...' : 'Repo'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedOwner && repos.length > 0 && (
                      <div className="p-2 border-b">
                        <Input
                          ref={filterInputRef}
                          placeholder={
                            repos.length > 50 ? `Filter ${repos.length} repositories...` : 'Filter repositories...'
                          }
                          value={repoFilter}
                          onChange={(e) => setRepoFilter(e.target.value)}
                          disabled={isSubmitting || loadingRepos}
                          className="text-sm h-8"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                    {filteredRepos.length === 0 && repoFilter ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No repositories match &quot;{repoFilter}&quot;
                      </div>
                    ) : (
                      <>
                        {displayedRepos.map((repo) => (
                          <SelectItem key={repo.full_name} value={repo.name}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{repo.name}</span>
                              {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </SelectItem>
                        ))}
                        {hasMoreRepos && (
                          <div className="p-2 text-xs text-muted-foreground text-center border-t">
                            Showing first 50 of {repos.length} repositories. Use filter to find more.
                          </div>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Agent, Model Selection and Submit Button Row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Agent Selection */}
                  <Select
                    value={selectedAgent}
                    onValueChange={(value) => {
                      setSelectedAgent(value)
                      // Save to localStorage immediately
                      localStorage.setItem('last-selected-agent', value)
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="w-auto min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                      <SelectValue placeholder="Agent" />
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

                  {/* Model Selection */}
                  <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                      setSelectedModel(value)
                      // Save to localStorage immediately
                      localStorage.setItem(`last-selected-model-${selectedAgent}`, value)
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="w-auto min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                      <SelectValue placeholder="Model" />
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

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isSubmitting || !prompt.trim() || !selectedOwner || !selectedRepo}
                  size="sm"
                  className="rounded-full h-8 w-8 p-0"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Desktop: Single-line layout */}
            <div className="hidden lg:flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Select
                  value={selectedOwner}
                  onValueChange={(value) => {
                    setSelectedOwner(value)
                    setSelectedRepo('') // Reset repo when owner changes
                    setRepoFilter('') // Reset filter when owner changes
                    // Save to localStorage immediately
                    localStorage.setItem('last-selected-owner', value)
                  }}
                  disabled={isSubmitting || loadingOwners}
                >
                  <SelectTrigger className="w-auto min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                    <SelectValue placeholder={loadingOwners ? 'Loading...' : 'Owner'} />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.login} value={owner.login}>
                        <div className="flex items-center gap-2">
                          <Image
                            src={owner.avatar_url}
                            alt={owner.login}
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded-full"
                          />
                          <span>{owner.login}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-muted-foreground">/</span>

                <Select
                  value={selectedRepo}
                  onValueChange={(value) => {
                    setSelectedRepo(value)
                    // Save to localStorage immediately
                    if (selectedOwner) {
                      localStorage.setItem(`last-selected-repo-${selectedOwner}`, value)
                    }
                  }}
                  disabled={isSubmitting || !selectedOwner || loadingRepos}
                  onOpenChange={setRepoDropdownOpen}
                >
                  <SelectTrigger className="w-auto min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                    <SelectValue
                      placeholder={!selectedOwner ? 'Select owner first' : loadingRepos ? 'Loading...' : 'Repo'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedOwner && repos.length > 0 && (
                      <div className="p-2 border-b">
                        <Input
                          ref={filterInputRef}
                          placeholder={
                            repos.length > 50 ? `Filter ${repos.length} repositories...` : 'Filter repositories...'
                          }
                          value={repoFilter}
                          onChange={(e) => setRepoFilter(e.target.value)}
                          disabled={isSubmitting || loadingRepos}
                          className="text-sm h-8"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                    {filteredRepos.length === 0 && repoFilter ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No repositories match &quot;{repoFilter}&quot;
                      </div>
                    ) : (
                      <>
                        {displayedRepos.map((repo) => (
                          <SelectItem key={repo.full_name} value={repo.name}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{repo.name}</span>
                              {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </SelectItem>
                        ))}
                        {hasMoreRepos && (
                          <div className="p-2 text-xs text-muted-foreground text-center border-t">
                            Showing first 50 of {repos.length} repositories. Use filter to find more.
                          </div>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>

                {/* Via text */}
                <span className="text-sm text-muted-foreground px-2">via</span>

                {/* Agent Selection */}
                <Select
                  value={selectedAgent}
                  onValueChange={(value) => {
                    setSelectedAgent(value)
                    // Save to localStorage immediately
                    localStorage.setItem('last-selected-agent', value)
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-auto min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                    <SelectValue placeholder="Agent" />
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

                {/* Model Selection */}
                <Select
                  value={selectedModel}
                  onValueChange={(value) => {
                    setSelectedModel(value)
                    // Save to localStorage immediately
                    localStorage.setItem(`last-selected-model-${selectedAgent}`, value)
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-auto min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8">
                    <SelectValue placeholder="Model" />
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

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting || !prompt.trim() || !selectedOwner || !selectedRepo}
                size="sm"
                className="rounded-full h-8 w-8 p-0"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
