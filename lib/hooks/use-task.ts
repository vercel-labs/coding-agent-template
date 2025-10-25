'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Task } from '@/lib/db/schema'

export function useTask(taskId: string) {
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const attemptCountRef = useRef(0)
  const hasFoundTaskRef = useRef(false)

  const fetchTask = useCallback(async () => {
    let errorOccurred = false
    try {
      const response = await fetch(`/api/tasks/${taskId}`)
      if (response.ok) {
        const data = await response.json()
        setTask(data.task)
        setError(null)
        hasFoundTaskRef.current = true
      } else if (response.status === 404) {
        // Only set error after multiple failed attempts (to handle race condition on task creation)
        // Wait for at least 3 attempts (up to ~6 seconds) before showing "Task not found"
        attemptCountRef.current += 1
        if (attemptCountRef.current >= 3 || hasFoundTaskRef.current) {
          setError('Task not found')
          setTask(null)
          errorOccurred = true
        }
        // If we haven't hit the attempt threshold yet, keep loading state
      } else {
        setError('Failed to fetch task')
        errorOccurred = true
      }
    } catch (err) {
      console.error('Error fetching task:', err)
      setError('Failed to fetch task')
      errorOccurred = true
    } finally {
      // Only stop loading after we've either found the task or exceeded attempt threshold
      if (hasFoundTaskRef.current || attemptCountRef.current >= 3 || errorOccurred) {
        setIsLoading(false)
      }
    }
  }, [taskId])

  // Initial fetch with retry logic
  useEffect(() => {
    attemptCountRef.current = 0
    hasFoundTaskRef.current = false
    setIsLoading(true)
    setError(null)

    // Fetch immediately
    fetchTask()

    // If task isn't found on first try, retry more aggressively initially
    // This handles the race condition where we navigate to the task page before the DB insert completes
    const retryInterval = setInterval(() => {
      if (!hasFoundTaskRef.current && attemptCountRef.current < 3) {
        fetchTask()
      } else {
        clearInterval(retryInterval)
      }
    }, 2000) // Check every 2 seconds for the first few attempts

    return () => clearInterval(retryInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]) // fetchTask is intentionally not in deps to avoid recreating interval on every fetchTask change

  // Poll for updates every 5 seconds after initial load
  useEffect(() => {
    // Only start polling after we've found the task or given up
    if (!isLoading) {
      const interval = setInterval(() => {
        fetchTask()
      }, 5000)

      return () => clearInterval(interval)
    }
  }, [fetchTask, isLoading])

  return { task, isLoading, error, refetch: fetchTask }
}
