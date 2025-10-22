'use client'

import { useState, useEffect, startTransition } from 'react'
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
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'

interface Commit {
  sha: string
  commit: {
    author: {
      name: string
      email: string
      date: string
    }
    message: string
  }
  author: {
    login: string
    avatar_url: string
  } | null
  html_url: string
}

interface RevertCommitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commit: Commit | null
  owner: string
  repo: string
  onRevert: (config: {
    commit: Commit
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
  }) => void
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

export function RevertCommitDialog({
  open,
  onOpenChange,
  commit,
  owner,
  repo,
  onRevert,
  maxSandboxDuration = 300,
}: RevertCommitDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [installDependencies, setInstallDependencies] = useState(false)
  const [maxDuration, setMaxDuration] = useState(300)
  const [keepAlive, setKeepAlive] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  // Update model when agent changes
  useEffect(() => {
    if (selectedAgent) {
      const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
      const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
      // Check if current model exists for the new agent, otherwise use default
      const modelExists = agentModels?.some((m) => m.value === selectedModel)
      if (!modelExists) {
        // Use startTransition to defer state update
        startTransition(() => {
          setSelectedModel(defaultModel)
        })
      }
    }
  }, [selectedAgent, selectedModel])

  const handleRevert = () => {
    if (!commit) return

    setIsReverting(true)
    onRevert({
      commit,
      selectedAgent,
      selectedModel,
      installDependencies,
      maxDuration,
      keepAlive,
    })
    setIsReverting(false)
    onOpenChange(false)
  }

  if (!commit) return null

  const commitShortSha = commit.sha.substring(0, 7)
  const commitMessage = commit.commit.message.split('\n')[0]

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Revert Commit</AlertDialogTitle>
          <AlertDialogDescription>
            Create a new task to revert commit <code className="bg-muted px-1 py-0.5 rounded">{commitShortSha}</code>:{' '}
            {commitMessage}
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
                  id="revert-install-deps"
                  checked={installDependencies}
                  onCheckedChange={(checked) => setInstallDependencies(!!checked)}
                />
                <Label
                  htmlFor="revert-install-deps"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Install Dependencies?
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="revert-max-duration" className="text-sm font-medium">
                  Maximum Duration
                </Label>
                <Select value={maxDuration.toString()} onValueChange={(value) => setMaxDuration(parseInt(value))}>
                  <SelectTrigger id="revert-max-duration" className="w-full">
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
                  id="revert-keep-alive"
                  checked={keepAlive}
                  onCheckedChange={(checked) => setKeepAlive(!!checked)}
                />
                <Label
                  htmlFor="revert-keep-alive"
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
          <AlertDialogAction onClick={handleRevert} disabled={isReverting}>
            {isReverting ? 'Creating...' : 'Create Task'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
