'use client'

import { useState, useEffect } from 'react'
import { TaskForm } from '@/components/task-form'
import { HomePageHeader } from '@/components/home-page-header'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTasks } from '@/components/app-layout'
import { getSelectedOwner, setSelectedOwner, getSelectedRepo, setSelectedRepo } from '@/lib/utils/cookies'


interface HomePageContentProps {
  initialSelectedOwner?: string
  initialSelectedRepo?: string
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
}

export function HomePageContent({ 
  initialSelectedOwner = '', 
  initialSelectedRepo = '',
  initialInstallDependencies = false,
  initialMaxDuration = 5
}: HomePageContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedOwner, setSelectedOwnerState] = useState(initialSelectedOwner)
  const [selectedRepo, setSelectedRepoState] = useState(initialSelectedRepo)
  const router = useRouter()
  const { refreshTasks, addTaskOptimistically } = useTasks()

  // No longer need the useEffect for loading cookies - they come from server

  // Wrapper functions to update both state and cookies
  const handleOwnerChange = (owner: string) => {
    setSelectedOwnerState(owner)
    setSelectedOwner(owner)
    // Clear repo when owner changes
    if (selectedRepo) {
      setSelectedRepoState('')
      setSelectedRepo('')
    }
  }

  const handleRepoChange = (repo: string) => {
    setSelectedRepoState(repo)
    setSelectedRepo(repo)
  }

  const handleTaskSubmit = async (data: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
  }) => {
    setIsSubmitting(true)

    // Add task optimistically to sidebar immediately
    const { id } = addTaskOptimistically(data)

    // Navigate to the new task page immediately
    router.push(`/tasks/${id}`)

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, id }), // Include the pre-generated ID
      })

      if (response.ok) {
        toast.success('Task created successfully!')
        // Refresh sidebar to get the real task data from server
        await refreshTasks()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create task')
        // TODO: Remove the optimistic task on error
        await refreshTasks() // For now, just refresh to remove the optimistic task
      }
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Failed to create task')
      // TODO: Remove the optimistic task on error
      await refreshTasks() // For now, just refresh to remove the optimistic task
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto p-3">
        <HomePageHeader 
          selectedOwner={selectedOwner}
          selectedRepo={selectedRepo}
          onOwnerChange={handleOwnerChange}
          onRepoChange={handleRepoChange}
        />

        <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
          <TaskForm 
            onSubmit={handleTaskSubmit} 
            isSubmitting={isSubmitting}
            selectedOwner={selectedOwner}
            selectedRepo={selectedRepo}
            initialInstallDependencies={initialInstallDependencies}
            initialMaxDuration={initialMaxDuration}
          />
        </div>
      </div>
    </div>
  )
}
