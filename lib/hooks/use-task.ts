'use client'

import useSWR from 'swr'
import { Task } from '@/lib/db/schema'
import { fetcher } from '@/lib/hooks/use-swr-fetcher'

export function useTask(taskId: string) {
  // Conditional fetching: only fetch if taskId is provided
  const shouldFetch = !!taskId

  const { data, error, mutate, isLoading } = useSWR<{ task: Task }>(
    shouldFetch ? `/api/tasks/${taskId}` : null,
    fetcher,
    {
      // Smart polling: stop when task reaches terminal status
      refreshInterval: (latestData) => {
        if (!latestData) {
          // Still loading, poll every 5 seconds
          return 5000
        }

        // Check if task status is terminal
        const taskStatus = latestData.task?.status
        if (taskStatus === 'completed' || taskStatus === 'error' || taskStatus === 'stopped') {
          // Stop polling for terminal states
          return 0
        }

        // Active task, poll every 5 seconds
        return 5000
      },
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
    },
  )

  const task = data?.task ?? null
  const errorMessage = error ? 'Failed to fetch task' : null

  return {
    task,
    isLoading,
    error: errorMessage,
    refetch: mutate,
  }
}
