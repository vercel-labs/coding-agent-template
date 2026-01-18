'use client'

import { SubAgentActivity } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, Bot, Zap, Clock } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SubAgentIndicatorProps {
  currentSubAgent: string | null | undefined
  subAgentActivity: SubAgentActivity[] | null | undefined
  lastHeartbeat: Date | null | undefined
  className?: string
}

const STATUS_CONFIG = {
  starting: {
    icon: Loader2,
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    animate: true,
    label: 'Starting',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    animate: true,
    label: 'Running',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    animate: false,
    label: 'Completed',
  },
  error: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    animate: false,
    label: 'Error',
  },
}

function formatDuration(startDate: Date | string, endDate?: Date | string): string {
  const start = new Date(startDate).getTime()
  const end = endDate ? new Date(endDate).getTime() : Date.now()
  const durationMs = end - start

  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function formatTimeAgo(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function SubAgentIndicator({
  currentSubAgent,
  subAgentActivity,
  lastHeartbeat,
  className,
}: SubAgentIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [, setTick] = useState(0)

  // Update elapsed time every second when there's an active sub-agent
  useEffect(() => {
    const hasActiveSubAgent = subAgentActivity?.some((sa) => sa.status === 'running' || sa.status === 'starting')

    if (!hasActiveSubAgent) return

    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [subAgentActivity])

  // No sub-agent activity to display
  if (!subAgentActivity || subAgentActivity.length === 0) {
    return null
  }

  const activeSubAgents = subAgentActivity.filter((sa) => sa.status === 'running' || sa.status === 'starting')
  const completedSubAgents = subAgentActivity.filter((sa) => sa.status === 'completed' || sa.status === 'error')

  const currentActivity = currentSubAgent
    ? subAgentActivity.find((sa) => sa.name === currentSubAgent && sa.status === 'running')
    : activeSubAgents[0]

  return (
    <div className={cn('rounded-lg border', className)} role="region" aria-label="Sub-agent activity">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger
          className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
          aria-label="Toggle sub-agent activity details"
          aria-expanded={isExpanded}
        >
          <div
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
              'hover:bg-accent/50',
              currentActivity
                ? `${STATUS_CONFIG[currentActivity.status].bgColor} ${STATUS_CONFIG[currentActivity.status].borderColor}`
                : 'bg-muted/30',
            )}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {currentActivity ? (
                  <>
                    Sub-agent: <span className="text-primary">{currentActivity.name}</span>
                  </>
                ) : (
                  `${subAgentActivity.length} sub-agent${subAgentActivity.length > 1 ? 's' : ''} invoked`
                )}
              </span>
              {activeSubAgents.length > 0 && (
                <Badge variant="secondary" className="h-5 text-xs">
                  {activeSubAgents.length} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentActivity && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDuration(currentActivity.startedAt)}
                </div>
              )}
              {lastHeartbeat && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3 text-green-500" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Last heartbeat: {formatTimeAgo(lastHeartbeat)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-2 space-y-2">
            {/* Active Sub-agents */}
            {activeSubAgents.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</div>
                {activeSubAgents.map((sa) => (
                  <SubAgentRow key={sa.id} activity={sa} />
                ))}
              </div>
            )}

            {/* Completed Sub-agents */}
            {completedSubAgents.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</div>
                {completedSubAgents.map((sa) => (
                  <SubAgentRow key={sa.id} activity={sa} />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function SubAgentRow({ activity }: { activity: SubAgentActivity }) {
  const config = STATUS_CONFIG[activity.status]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-md border min-h-[44px]',
        config.bgColor,
        config.borderColor,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', config.color, config.animate && 'animate-spin')} />
        <div>
          <div className="text-sm font-medium">{activity.name}</div>
          {activity.description && (
            <div className="text-xs text-muted-foreground line-clamp-1">{activity.description}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('text-xs', config.color)}>
          {config.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDuration(activity.startedAt, activity.completedAt)}
        </span>
      </div>
    </div>
  )
}

/**
 * Compact version of the sub-agent indicator for use in the logs pane header
 */
export function SubAgentIndicatorCompact({
  currentSubAgent,
  subAgentActivity,
}: Pick<SubAgentIndicatorProps, 'currentSubAgent' | 'subAgentActivity'>) {
  const activeSubAgents = subAgentActivity?.filter((sa) => sa.status === 'running' || sa.status === 'starting')

  if (!activeSubAgents || activeSubAgents.length === 0) {
    return null
  }

  const currentActivity = currentSubAgent
    ? subAgentActivity?.find((sa) => sa.name === currentSubAgent && sa.status === 'running')
    : activeSubAgents[0]

  if (!currentActivity) return null

  const config = STATUS_CONFIG[currentActivity.status]
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs',
              config.bgColor,
              config.borderColor,
              'border',
            )}
            role="status"
            aria-label={`Sub-agent ${currentActivity.name} is running`}
          >
            <Icon className={cn('h-3 w-3', config.color, config.animate && 'animate-spin')} />
            <span className="font-medium">{currentActivity.name}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Sub-agent running: {currentActivity.description || currentActivity.name}</p>
          <p className="text-xs text-muted-foreground">Duration: {formatDuration(currentActivity.startedAt)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
