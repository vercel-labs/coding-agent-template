'use client'

import { useState, useEffect, useCallback } from 'react'
import { Task } from '@/lib/db/schema'

export function useTask(taskId: string) {
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTask = useCallback(async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`)
      if (response.ok) {
        const data = await response.json()
        setTask(data.task)
        setError(null)
      } else if (response.status === 404) {
        setError('Task not found')
        setTask(null)
      } else {
        setError('Failed to fetch task')
      }
    } catch (err) {
      console.error('Error fetching task:', err)
      setError('Failed to fetch task')
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  // Initial fetch
  useEffect(() => {
    fetchTask()
  }, [fetchTask])

  // Poll for updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTask()
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchTask])

  return { task, isLoading, error, refetch: fetchTask }
}
