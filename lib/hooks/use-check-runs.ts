'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/hooks/use-swr-fetcher'

interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string | null
  completed_at: string | null
}

interface CheckRunsResponse {
  success: boolean
  checkRuns: CheckRun[]
}

/**
 * Hook for fetching and polling check runs with SWR.
 *
 * Implements the `client-swr-dedup` Vercel React best practice:
 * - Automatic request deduplication when multiple components fetch the same endpoint
 * - Stale-while-revalidate caching
 * - Only fetches if taskId and branchName are available (check runs require branch context)
 * - Pauses polling when tab is hidden
 * - Resumes polling on window focus
 *
 * Usage:
 *   const { checkRuns, isLoading, error } = useCheckRuns(taskId, branchName)
 *
 *   // Only renders for open PRs that have a branch
 *   if (!branchName) return null
 */
export function useCheckRuns(taskId: string, branchName: string | null | undefined) {
  // Only fetch if we have both taskId and branchName (check runs require branch context)
  const shouldFetch = !!taskId && !!branchName

  const { data, error, isLoading } = useSWR<CheckRunsResponse>(
    shouldFetch ? `/api/tasks/${taskId}/check-runs` : null,
    fetcher,
    {
      refreshInterval: 30000, // Poll every 30 seconds
      revalidateOnFocus: false, // Don't refetch on focus for check-runs
      refreshWhenHidden: false, // Pause polling when tab is hidden
      refreshWhenOffline: false, // Don't poll when offline
      dedupingInterval: 30000, // Prevent duplicate requests within 30 second window
    },
  )

  return {
    checkRuns: data?.checkRuns || [],
    isLoading,
    error,
  }
}
