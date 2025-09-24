'use client'

import { Task } from '@/lib/db/schema'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, CheckCircle, AlertCircle, Loader2, Plus, Github } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Claude, Codex, Cursor, OpenCode } from '@/components/logos'

// Model mappings for human-friendly names
const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
  ],
  codex: [
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
  ],
  cursor: [
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

interface TaskSidebarProps {
  tasks: Task[]
  selectedTask: Task | null
  onTaskSelect: (task: Task) => void
  width?: number
}

export function TaskSidebar({ tasks, selectedTask, onTaskSelect, width = 288 }: TaskSidebarProps) {
  const pathname = usePathname()

  const getHumanFriendlyModelName = (agent: string | null, model: string | null) => {
    if (!agent || !model) return model

    const agentModels = AGENT_MODELS[agent as keyof typeof AGENT_MODELS]
    if (!agentModels) return model

    const modelInfo = agentModels.find(m => m.value === model)
    return modelInfo ? modelInfo.label : model
  }

  const getAgentLogo = (agent: string | null) => {
    if (!agent) return null
    
    switch (agent.toLowerCase()) {
      case 'claude':
        return Claude
      case 'codex':
        return Codex
      case 'cursor':
        return Cursor
      case 'opencode':
        return OpenCode
      default:
        return null
    }
  }

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4" />
      case 'error':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-500'
      case 'processing':
        return 'bg-blue-500'
      case 'completed':
        return 'bg-green-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="h-full border-r bg-muted p-3 overflow-y-auto" style={{ width: `${width}px` }}>
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {tasks.length} Task{tasks.length !== 1 ? 's' : ''}
          </h2>
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-1">
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-3 text-center text-xs text-muted-foreground">
              No tasks yet. Create your first task!
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => {
            const isActive = pathname === `/tasks/${task.id}`

            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                onClick={() => onTaskSelect(task)}
                className={cn(
                  'block rounded-lg',
                  isActive && 'ring-1 ring-primary/50 ring-offset-0',
                )}
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
                      <h3 className={cn(
                        "text-xs font-medium truncate mb-0.5",
                        task.status === 'processing' && "bg-gradient-to-r from-muted-foreground from-20% via-white via-50% to-muted-foreground to-80% bg-clip-text text-transparent bg-[length:300%_100%] animate-[shimmer_1.5s_linear_infinite]"
                      )}>
                        {task.prompt.slice(0, 50) + (task.prompt.length > 50 ? '...' : '')}
                      </h3>
                      {task.repoUrl && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                          <span className="truncate">
                            {(() => {
                              try {
                                const url = new URL(task.repoUrl)
                                const pathParts = url.pathname.split('/').filter(Boolean)
                                if (pathParts.length >= 2) {
                                  return `${pathParts[0]}/${pathParts[1].replace('.git', '')}`
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
                            <span className="truncate">{getHumanFriendlyModelName(task.selectedAgent, task.selectedModel)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
