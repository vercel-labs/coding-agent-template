'use client'

import { useState, useEffect } from 'react'
import { Task } from '@/lib/db/schema'

export function useTask(taskId: string) {
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTask = async () => {
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
  }

  // Initial fetch
  useEffect(() => {
    fetchTask()
  }, [taskId])

  // Poll for updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTask()
    }, 5000)

    return () => clearInterval(interval)
  }, [taskId])

  return { task, isLoading, error, refetch: fetchTask }
}
