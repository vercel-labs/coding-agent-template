'use client'

import { Check } from 'lucide-react'
import { useCheckRuns } from '@/lib/hooks/use-check-runs'

interface PRCheckStatusProps {
  taskId: string
  branchName: string | null | undefined
  prStatus: 'open' | 'closed' | 'merged'
  isActive?: boolean
  className?: string
}

export function PRCheckStatus({ taskId, branchName, prStatus, isActive = false, className = '' }: PRCheckStatusProps) {
  const { checkRuns, isLoading } = useCheckRuns(taskId, branchName)

  // Only show indicator for open PRs
  if (prStatus !== 'open') {
    return null
  }

  // Don't render anything if loading or no check runs
  if (isLoading || checkRuns.length === 0) {
    return null
  }

  // Determine overall status
  const hasInProgress = checkRuns.some((run) => run.status === 'in_progress' || run.status === 'queued')
  const hasFailed = checkRuns.some((run) => run.conclusion === 'failure' || run.conclusion === 'cancelled')
  const hasNeutral = checkRuns.some((run) => run.conclusion === 'neutral')
  const allPassed = checkRuns.every((run) => run.status === 'completed' && run.conclusion === 'success')

  // Determine background color based on active state
  const bgColor = isActive ? 'bg-accent' : 'bg-card'

  // Render the appropriate indicator
  // Note: Check failed first to ensure failures are always visible, even if other checks are in progress
  if (hasFailed) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 ${bgColor} rounded-full p-0.5 ${className}`}>
        <div className="w-1 h-1 rounded-full bg-red-500" />
      </div>
    )
  }

  if (hasInProgress) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 ${bgColor} rounded-full p-0.5 ${className}`}>
        <div className="w-1 h-1 rounded-full bg-yellow-500 animate-pulse" />
      </div>
    )
  }

  if (hasNeutral) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 ${bgColor} rounded-full p-0.5 ${className}`}>
        <div className="w-1 h-1 rounded-full bg-blue-500" />
      </div>
    )
  }

  if (allPassed) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 ${bgColor} rounded-full p-0.5 ${className}`}>
        <Check className="w-1.5 h-1.5 text-green-500" strokeWidth={3} />
      </div>
    )
  }

  return null
}
