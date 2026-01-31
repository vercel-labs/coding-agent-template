'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/hooks/use-swr-fetcher'
import type { TaskMessage } from '@/lib/db/schema'

interface TaskMessagesResponse {
  success: boolean
  messages: TaskMessage[]
}

/**
 * Hook for fetching and polling task messages with SWR.
 *
 * Implements the `client-swr-dedup` Vercel React best practice:
 * - Automatic request deduplication
 * - Stale-while-revalidate caching
 * - Pauses polling when tab is hidden
 * - Resumes polling on window focus
 *
 * Usage:
 *   const { messages, isLoading, error, mutate } = useTaskMessages(taskId)
 *
 *   // Revalidate after sending a message:
 *   await mutate()
 */
export function useTaskMessages(taskId: string) {
  const { data, error, isLoading, mutate } = useSWR<TaskMessagesResponse>(
    taskId ? `/api/tasks/${taskId}/messages` : null,
    fetcher,
    {
      refreshInterval: 3000, // Poll every 3 seconds
      revalidateOnFocus: true, // Refresh when window regains focus
      refreshWhenHidden: false, // Pause polling when tab is hidden
      refreshWhenOffline: false, // Don't poll when offline
      dedupingInterval: 2000, // Prevent duplicate requests within 2 seconds
    },
  )

  return {
    messages: data?.messages || [],
    isLoading,
    error,
    mutate, // For manual revalidation after sending a message
  }
}
