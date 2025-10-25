'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'

interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string | null
  completed_at: string | null
}

interface PRCheckStatusProps {
  taskId: string
  className?: string
}

export function PRCheckStatus({ taskId, className = '' }: PRCheckStatusProps) {
  const [checkRuns, setCheckRuns] = useState<CheckRun[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCheckRuns = async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/check-runs`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.checkRuns) {
            setCheckRuns(data.checkRuns)
          }
        }
      } catch (error) {
        console.error('Error fetching check runs:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCheckRuns()
    // Refresh every 30 seconds for in-progress checks
    const interval = setInterval(fetchCheckRuns, 30000)
    return () => clearInterval(interval)
  }, [taskId])

  // Don't render anything if loading or no check runs
  if (isLoading || checkRuns.length === 0) {
    return null
  }

  // Determine overall status
  const hasInProgress = checkRuns.some((run) => run.status === 'in_progress' || run.status === 'queued')
  const hasFailed = checkRuns.some((run) => run.conclusion === 'failure' || run.conclusion === 'cancelled')
  const allPassed = checkRuns.every((run) => run.status === 'completed' && run.conclusion === 'success')

  // Render the appropriate indicator
  if (hasInProgress) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
      </div>
    )
  }

  if (hasFailed) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-red-500" />
      </div>
    )
  }

  if (allPassed) {
    return (
      <div className={`absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5 ${className}`}>
        <Check className="w-2.5 h-2.5 text-green-500" strokeWidth={3} />
      </div>
    )
  }

  return null
}
