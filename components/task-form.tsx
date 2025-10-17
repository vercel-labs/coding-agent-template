'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, ArrowUp, Settings, X, Cable, Key } from 'lucide-react'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { setInstallDependencies, setMaxDuration, setKeepAlive } from '@/lib/utils/cookies'
import { useConnectors } from '@/components/connectors-provider'
import { ConnectorDialog } from '@/components/connectors/manage-connectors'
import { ApiKeysDialog } from '@/components/api-keys-dialog'
import { toast } from 'sonner'
import { useAtom } from 'jotai'
import { taskPromptAtom } from '@/lib/atoms/task'

interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
}

interface TaskFormProps {
  onSubmit: (data: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
  }) => void
  isSubmitting: boolean
  selectedOwner: string
  selectedRepo: string
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
  initialKeepAlive?: boolean
  maxSandboxDuration?: number
}

const CODING_AGENTS = [
  { value: 'claude', label: 'Claude', icon: Claude },
  { value: 'codex', label: 'Codex', icon: Codex },
  { value: 'copilot', label: 'Copilot', icon: Copilot },
  { value: 'cursor', label: 'Cursor', icon: Cursor },
  { value: 'gemini', label: 'Gemini', icon: Gemini },
  { value: 'opencode', label: 'opencode', icon: OpenCode },
] as const

// Model options for each agent
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
    { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
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
} as const

// Default models for each agent
const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  codex: 'openai/gpt-5',
  copilot: 'claude-sonnet-4.5',
  cursor: 'auto',
  gemini: 'gemini-2.5-pro',
  opencode: 'gpt-5',
} as const

// API key requirements for each agent
const AGENT_API_KEY_REQUIREMENTS: Record<string, Provider[]> = {
  claude: ['anthropic'],
  codex: ['aigateway'], // Uses AI Gateway for OpenAI proxy
  copilot: [], // Uses user's GitHub account token automatically
  cursor: ['cursor'],
  gemini: ['gemini'],
  opencode: [], // Will be determined dynamically based on selected model
}

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

// Helper to determine which API key is needed for opencode based on model
const getOpenCodeRequiredKeys = (model: string): Provider[] => {
  // Check if it's an Anthropic model (claude models)
  if (model.includes('claude') || model.includes('sonnet') || model.includes('opus')) {
    return ['anthropic']
  }
  // Check if it's an OpenAI/GPT model (uses AI Gateway)
  if (model.includes('gpt')) {
    return ['aigateway']
  }
  // Fallback to both if we can't determine
  return ['aigateway', 'anthropic']
}

export function TaskForm({
  onSubmit,
  isSubmitting,
  selectedOwner,
  selectedRepo,
  initialInstallDependencies = false,
  initialMaxDuration = 300,
  initialKeepAlive = false,
  maxSandboxDuration = 300,
}: TaskFormProps) {
  const [prompt, setPrompt] = useAtom(taskPromptAtom)
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [, setLoadingRepos] = useState(false)

  // Options state - initialize with server values
  const [installDependencies, setInstallDependenciesState] = useState(initialInstallDependencies)
  const [maxDuration, setMaxDurationState] = useState(initialMaxDuration)
  const [keepAlive, setKeepAliveState] = useState(initialKeepAlive)
  const [showOptionsDialog, setShowOptionsDialog] = useState(false)
  const [showMcpServersDialog, setShowMcpServersDialog] = useState(false)
  const [showApiKeysDialog, setShowApiKeysDialog] = useState(false)

  // Connectors state
  const { connectors } = useConnectors()

  // API keys state
  const [savedApiKeys, setSavedApiKeys] = useState<Set<Provider>>(new Set())

  // Ref for the textarea to focus it programmatically
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Wrapper functions to update both state and cookies
  const updateInstallDependencies = (value: boolean) => {
    setInstallDependenciesState(value)
    setInstallDependencies(value)
  }

  const updateMaxDuration = (value: number) => {
    setMaxDurationState(value)
    setMaxDuration(value)
  }

  const updateKeepAlive = (value: boolean) => {
    setKeepAliveState(value)
    setKeepAlive(value)
  }

  // Handle keyboard events in textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // On desktop: Enter submits, Shift+Enter creates new line
      // On mobile: Enter creates new line, must use submit button
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      if (!isMobile && !e.shiftKey) {
        e.preventDefault()
        if (prompt.trim()) {
          // Find the form and submit it
          const form = e.currentTarget.closest('form')
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
          }
        }
      }
      // For all other cases (mobile Enter, desktop Shift+Enter), let default behavior create new line
    }
  }

  // Load saved agent, model, and options on mount, and focus the prompt input
  useEffect(() => {
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

    // Options are now initialized from server props, no need to load from cookies

    // Focus the prompt input when the component mounts
    if (textareaRef.current) {
      textareaRef.current.focus()
    }

    // Fetch user's saved API keys
    const fetchApiKeys = async () => {
      try {
        const response = await fetch('/api/api-keys')
        const data = await response.json()

        if (data.success) {
          const saved = new Set<Provider>()
          data.apiKeys.forEach((key: { provider: Provider }) => {
            saved.add(key.provider)
          })
          setSavedApiKeys(saved)
        }
      } catch (error) {
        console.error('Error fetching API keys:', error)
      }
    }

    fetchApiKeys()
  }, [])

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

  // Fetch repositories when owner changes
  useEffect(() => {
    if (!selectedOwner) {
      setRepos([])
      return
    }

    const fetchRepos = async () => {
      setLoadingRepos(true)
      try {
        // Check cache first
        const cacheKey = `github-repos-${selectedOwner}`
        const cachedRepos = localStorage.getItem(cacheKey)

        if (cachedRepos) {
          try {
            const parsedRepos = JSON.parse(cachedRepos)
            setRepos(parsedRepos)
            setLoadingRepos(false)
            return
          } catch {
            console.warn('Failed to parse cached repos, fetching fresh data')
            localStorage.removeItem(cacheKey)
          }
        }

        const response = await fetch(`/api/github/repos?owner=${selectedOwner}`)
        if (response.ok) {
          const reposList = await response.json()
          setRepos(reposList)

          // Cache the results
          localStorage.setItem(cacheKey, JSON.stringify(reposList))
        }
      } catch (error) {
        console.error('Error fetching repositories:', error)
      } finally {
        setLoadingRepos(false)
      }
    }

    fetchRepos()
  }, [selectedOwner])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) {
      return
    }

    // If owner/repo not selected, let parent handle it (will show sign-in if needed)
    // Don't clear localStorage here - user might need to sign in and come back
    if (!selectedOwner || !selectedRepo) {
      onSubmit({
        prompt: prompt.trim(),
        repoUrl: '',
        selectedAgent,
        selectedModel,
        installDependencies,
        maxDuration,
        keepAlive,
      })
      return
    }

    // Check if API key is required and available for the selected agent and model
    // Skip this check if we don't have repo data (likely not signed in)
    const selectedRepoData = repos.find((repo) => repo.name === selectedRepo)

    if (selectedRepoData) {
      try {
        const response = await fetch(`/api/api-keys/check?agent=${selectedAgent}&model=${selectedModel}`)
        const data = await response.json()

        if (!data.hasKey) {
          // Show error message with provider name
          const providerNames: Record<string, string> = {
            anthropic: 'Anthropic',
            openai: 'OpenAI',
            cursor: 'Cursor',
            gemini: 'Gemini',
            aigateway: 'AI Gateway',
          }
          const providerName = providerNames[data.provider] || data.provider

          toast.error(`${providerName} API key required`, {
            description: `Please add your ${providerName} API key to use the ${data.agentName} agent with this model.`,
            action: {
              label: 'Add API Key',
              onClick: () => setShowApiKeysDialog(true),
            },
          })
          return
        }
      } catch (error) {
        console.error('Error checking API key:', error)
        // Don't show error toast - might just be not authenticated, let parent handle it
      }
    }

    onSubmit({
      prompt: prompt.trim(),
      repoUrl: selectedRepoData?.clone_url || '',
      selectedAgent,
      selectedModel,
      installDependencies,
      maxDuration,
      keepAlive,
    })
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">Coding Agent Template</h1>
        <p className="text-lg text-muted-foreground mb-2">
          Multi-agent AI coding platform powered by{' '}
          <a
            href="https://vercel.com/docs/sandbox"
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
        <div className="relative border rounded-2xl shadow-sm overflow-hidden bg-muted/30 cursor-text">
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

          {/* Agent Selection */}
          <div className="p-4">
            <div className="flex items-center gap-2">
              {/* Agent Selection - Icon only on mobile, minimal width */}
              <Select
                value={selectedAgent}
                onValueChange={(value) => {
                  setSelectedAgent(value)
                  // Save to localStorage immediately
                  localStorage.setItem('last-selected-agent', value)
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-auto sm:min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 h-8 shrink-0">
                  <SelectValue placeholder="Agent">
                    {selectedAgent && (() => {
                      const agent = CODING_AGENTS.find((a) => a.value === selectedAgent)
                      return agent ? (
                        <div className="flex items-center gap-2">
                          <agent.icon className="w-4 h-4" />
                          <span className="hidden sm:inline">{agent.label}</span>
                        </div>
                      ) : null
                    })()}
                  </SelectValue>
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

              {/* Model Selection - Fills available width on mobile */}
              <Select
                value={selectedModel}
                onValueChange={(value) => {
                  setSelectedModel(value)
                  // Save to localStorage immediately
                  localStorage.setItem(`last-selected-model-${selectedAgent}`, value)
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger className="flex-1 sm:flex-none sm:w-auto sm:min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8 min-w-0">
                  <SelectValue placeholder="Model" className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]?.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  )) || []}
                </SelectContent>
              </Select>

              {/* Option Chips - Only visible on desktop */}
              {(!installDependencies || maxDuration !== maxSandboxDuration || keepAlive) && (
                <div className="hidden sm:flex items-center gap-2 flex-wrap">
                  {!installDependencies && (
                    <Badge
                      variant="secondary"
                      className="text-xs h-6 px-2 gap-1 cursor-pointer hover:bg-muted/20 bg-transparent border-0"
                      onClick={() => setShowOptionsDialog(true)}
                    >
                      Skip Install
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-3 w-3 p-0 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateInstallDependencies(true)
                        }}
                      >
                        <X className="h-2 w-2" />
                      </Button>
                    </Badge>
                  )}
                  {maxDuration !== maxSandboxDuration && (
                    <Badge
                      variant="secondary"
                      className="text-xs h-6 px-2 gap-1 cursor-pointer hover:bg-muted/20 bg-transparent border-0"
                      onClick={() => setShowOptionsDialog(true)}
                    >
                      {maxDuration}m
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-3 w-3 p-0 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateMaxDuration(maxSandboxDuration)
                        }}
                      >
                        <X className="h-2 w-2" />
                      </Button>
                    </Badge>
                  )}
                  {keepAlive && (
                    <Badge
                      variant="secondary"
                      className="text-xs h-6 px-2 gap-1 cursor-pointer hover:bg-muted/20 bg-transparent border-0"
                      onClick={() => setShowOptionsDialog(true)}
                    >
                      Keep Alive
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-3 w-3 p-0 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateKeepAlive(false)
                        }}
                      >
                        <X className="h-2 w-2" />
                      </Button>
                    </Badge>
                  )}
                </div>
              )}

              {/* Action Icons and Submit Button */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Buttons */}
                <div className="flex items-center gap-2">
                  <TooltipProvider delayDuration={1500} skipDelayDuration={1500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-8 w-8 p-0 relative"
                          onClick={() => setShowApiKeysDialog(true)}
                        >
                          <Key className="h-4 w-4" />
                          {savedApiKeys.size > 0 && (
                            <Badge
                              variant="secondary"
                              className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px] rounded-full"
                            >
                              {savedApiKeys.size}
                            </Badge>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>API Keys</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-8 w-8 p-0 relative"
                          onClick={() => setShowMcpServersDialog(true)}
                        >
                          <Cable className="h-4 w-4" />
                          {connectors.filter((c) => c.status === 'connected').length > 0 && (
                            <Badge
                              variant="secondary"
                              className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px] rounded-full"
                            >
                              {connectors.filter((c) => c.status === 'connected').length}
                            </Badge>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>MCP Servers</p>
                      </TooltipContent>
                    </Tooltip>

                    <Dialog open={showOptionsDialog} onOpenChange={setShowOptionsDialog}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0 relative">
                              <Settings className="h-4 w-4" />
                              {(() => {
                                const customOptionsCount = [
                                  !installDependencies,
                                  maxDuration !== maxSandboxDuration,
                                  keepAlive
                                ].filter(Boolean).length
                                return customOptionsCount > 0 ? (
                                  <Badge
                                    variant="secondary"
                                    className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px] rounded-full sm:hidden"
                                  >
                                    {customOptionsCount}
                                  </Badge>
                                ) : null
                              })()}
                            </Button>
                          </DialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Task Options</p>
                        </TooltipContent>
                      </Tooltip>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Task Options</DialogTitle>
                          <DialogDescription>Configure settings for your task execution.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-4 overflow-y-auto flex-1">
                          <div className="space-y-4">
                            <h3 className="text-sm font-semibold">Task Settings</h3>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="install-deps"
                                checked={installDependencies}
                                onCheckedChange={(checked) => updateInstallDependencies(checked === true)}
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
                              <Select
                                value={maxDuration.toString()}
                                onValueChange={(value) => updateMaxDuration(parseInt(value))}
                              >
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
                                onCheckedChange={(checked) => updateKeepAlive(checked === true)}
                              />
                              <Label
                                htmlFor="keep-alive"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                Keep Alive ({maxSandboxDuration} minutes max)
                              </Label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Keep the sandbox running after task completion to reuse it for follow-up messages.
                            </p>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TooltipProvider>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !prompt.trim()}
                    size="sm"
                    className="rounded-full h-8 w-8 p-0"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <ApiKeysDialog
        open={showApiKeysDialog}
        onOpenChange={(open) => {
          setShowApiKeysDialog(open)
          // Refetch API keys when dialog closes to update the saved keys state
          if (!open) {
            fetch('/api/api-keys')
              .then((res) => res.json())
              .then((data) => {
                if (data.success) {
                  const saved = new Set<Provider>()
                  data.apiKeys.forEach((key: { provider: Provider }) => {
                    saved.add(key.provider)
                  })
                  setSavedApiKeys(saved)
                }
              })
              .catch((error) => console.error('Error refetching API keys:', error))
          }
        }}
      />
      <ConnectorDialog open={showMcpServersDialog} onOpenChange={setShowMcpServersDialog} />
    </div>
  )
}
