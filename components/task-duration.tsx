'use client'

import { useState, useEffect } from 'react'
import { Task } from '@/lib/db/schema'

interface TaskDurationProps {
  task: Task
  hideTitle?: boolean
}

export function TaskDuration({ task, hideTitle = false }: TaskDurationProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    // Only set up interval if task is still running
    if (task.status === 'processing' || task.status === 'pending') {
      const interval = setInterval(() => {
        setCurrentTime(Date.now())
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [task.status])

  const formatDuration = () => {
    const startTime = new Date(task.createdAt).getTime()
    const endTime = task.completedAt ? new Date(task.completedAt).getTime() : currentTime
    const durationMs = endTime - startTime
    const durationSeconds = Math.floor(durationMs / 1000)

    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60

    // Format as MM:SS with zero padding
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  if (hideTitle) {
    return <p className="text-sm text-muted-foreground min-w-[40px] inline-block">{formatDuration()}</p>
  }

  return (
    <div>
      <h4 className="font-medium mb-1">Duration</h4>
      <p className="text-sm text-muted-foreground">{formatDuration()}</p>
    </div>
  )
}
