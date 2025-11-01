'use client'

import { useState, useEffect } from 'react'
import { TaskForm } from '@/components/task-form'
import { HomePageHeader } from '@/components/home-page-header'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTasks } from '@/components/app-layout'
import { setSelectedOwner, setSelectedRepo } from '@/lib/utils/cookies'
import type { Session } from '@/lib/session/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { redirectToSignIn } from '@/lib/session/redirect-to-sign-in'
import { GitHubIcon } from '@/components/icons/github-icon'
import { getEnabledAuthProviders } from '@/lib/auth/providers'
import { useSetAtom } from 'jotai'
import { taskPromptAtom } from '@/lib/atoms/task'
import { HomePageMobileFooter } from '@/components/home-page-mobile-footer'

interface HomePageContentProps {
  initialSelectedOwner?: string
  initialSelectedRepo?: string
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
  initialKeepAlive?: boolean
  maxSandboxDuration?: number
  user?: Session['user'] | null
  initialStars?: number
}

export function HomePageContent({
  initialSelectedOwner = '',
  initialSelectedRepo = '',
  initialInstallDependencies = false,
  initialMaxDuration = 300,
  initialKeepAlive = false,
  maxSandboxDuration = 300,
  user = null,
  initialStars = 1200,
}: HomePageContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedOwner, setSelectedOwnerState] = useState(initialSelectedOwner)
  const [selectedRepo, setSelectedRepoState] = useState(initialSelectedRepo)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [loadingVercel, setLoadingVercel] = useState(false)
  const [loadingGitHub, setLoadingGitHub] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshTasks, addTaskOptimistically } = useTasks()
  const setTaskPrompt = useSetAtom(taskPromptAtom)

  // Check which auth providers are enabled
  const { github: hasGitHub, vercel: hasVercel } = getEnabledAuthProviders()

  // Show toast if GitHub was connected (user was already logged in)
  useEffect(() => {
    if (searchParams.get('github_connected') === 'true') {
      toast.success('GitHub account connected successfully!')
      // Remove the query parameter from URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('github_connected')
      window.history.replaceState({}, '', newUrl.toString())
    }
  }, [searchParams])

  // Check for newly created repo and select it
  useEffect(() => {
    const newlyCreatedRepo = localStorage.getItem('newly-created-repo')
    if (newlyCreatedRepo) {
      try {
        const { owner, repo } = JSON.parse(newlyCreatedRepo)
        if (owner && repo) {
          // Set owner and repo directly without triggering the clear logic
          setSelectedOwnerState(owner)
          setSelectedOwner(owner)
          setSelectedRepoState(repo)
          setSelectedRepo(repo)
        }
      } catch (error) {
        console.error('Error parsing newly created repo:', error)
      } finally {
        // Clear the localStorage item after using it
        localStorage.removeItem('newly-created-repo')
      }
    }
  }, []) // Run only on mount

  // Check for URL query parameters for owner and repo
  useEffect(() => {
    const urlOwner = searchParams.get('owner')
    const urlRepo = searchParams.get('repo')

    if (urlOwner && urlOwner !== selectedOwner) {
      setSelectedOwnerState(urlOwner)
      setSelectedOwner(urlOwner)
    }
    if (urlRepo && urlRepo !== selectedRepo) {
      setSelectedRepoState(urlRepo)
      setSelectedRepo(urlRepo)
    }
  }, [searchParams, selectedOwner, selectedRepo])

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
    selectedModels?: string[]
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
  }) => {
    // Check if user is authenticated
    if (!user) {
      setShowSignInDialog(true)
      return
    }

    // Check if user has selected a repository
    if (!data.repoUrl) {
      toast.error('Please select a repository', {
        description: 'Choose a GitHub repository to work with from the header.',
      })
      return
    }

    // Clear the saved prompt since we're actually submitting it now
    setTaskPrompt('')

    setIsSubmitting(true)

    // Check if this is multi-agent mode with multiple models selected
    const isMultiAgent = data.selectedAgent === 'multi-agent' && data.selectedModels && data.selectedModels.length > 0

    if (isMultiAgent) {
      // Create multiple tasks, one for each selected model
      const taskIds: string[] = []
      const tasksData = data.selectedModels!.map((modelValue) => {
        // Parse agent:model format
        const [agent, model] = modelValue.split(':')
        const { id } = addTaskOptimistically({
          prompt: data.prompt,
          repoUrl: data.repoUrl,
          selectedAgent: agent,
          selectedModel: model,
          installDependencies: data.installDependencies,
          maxDuration: data.maxDuration,
        })
        taskIds.push(id)
        return {
          id,
          prompt: data.prompt,
          repoUrl: data.repoUrl,
          selectedAgent: agent,
          selectedModel: model,
          installDependencies: data.installDependencies,
          maxDuration: data.maxDuration,
          keepAlive: data.keepAlive,
        }
      })

      // Navigate to the first task
      router.push(`/tasks/${taskIds[0]}`)

      try {
        // Create all tasks in parallel
        const responses = await Promise.all(
          tasksData.map((taskData) =>
            fetch('/api/tasks', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(taskData),
            }),
          ),
        )

        const successCount = responses.filter((r) => r.ok).length
        const failCount = responses.length - successCount

        if (successCount === responses.length) {
          toast.success(`${successCount} tasks created successfully!`)
        } else if (successCount > 0) {
          toast.warning(`${successCount} tasks created, ${failCount} failed`)
        } else {
          toast.error('Failed to create tasks')
        }

        // Refresh sidebar to get the real task data from server
        await refreshTasks()
      } catch (error) {
        console.error('Error creating tasks:', error)
        toast.error('Failed to create tasks')
        await refreshTasks()
      } finally {
        setIsSubmitting(false)
      }
    } else {
      // Single task creation (original behavior)
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
          // Show detailed message for rate limits, or generic error message
          toast.error(error.message || error.error || 'Failed to create task')
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
  }

  const handleVercelSignIn = async () => {
    setLoadingVercel(true)
    await redirectToSignIn()
  }

  const handleGitHubSignIn = () => {
    setLoadingGitHub(true)
    window.location.href = '/api/auth/signin/github'
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <HomePageHeader
          selectedOwner={selectedOwner}
          selectedRepo={selectedRepo}
          onOwnerChange={handleOwnerChange}
          onRepoChange={handleRepoChange}
          user={user}
          initialStars={initialStars}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-20 md:pb-4">
        <TaskForm
          onSubmit={handleTaskSubmit}
          isSubmitting={isSubmitting}
          selectedOwner={selectedOwner}
          selectedRepo={selectedRepo}
          initialInstallDependencies={initialInstallDependencies}
          initialMaxDuration={initialMaxDuration}
          initialKeepAlive={initialKeepAlive}
          maxSandboxDuration={maxSandboxDuration}
        />
      </div>

      {/* Mobile Footer with Stars and Deploy Button - Only show when logged in */}
      {user && <HomePageMobileFooter initialStars={initialStars} />}

      {/* Sign In Dialog */}
      <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to continue</DialogTitle>
            <DialogDescription>
              {hasGitHub && hasVercel
                ? 'You need to sign in to create tasks. Choose how you want to sign in.'
                : hasVercel
                  ? 'You need to sign in with Vercel to create tasks.'
                  : 'You need to sign in with GitHub to create tasks.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            {hasVercel && (
              <Button
                onClick={handleVercelSignIn}
                disabled={loadingVercel || loadingGitHub}
                variant="outline"
                size="lg"
                className="w-full"
              >
                {loadingVercel ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 76 65" className="h-3 w-3 mr-2" fill="currentColor">
                      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                    </svg>
                    Sign in with Vercel
                  </>
                )}
              </Button>
            )}

            {hasGitHub && (
              <Button
                onClick={handleGitHubSignIn}
                disabled={loadingVercel || loadingGitHub}
                variant="outline"
                size="lg"
                className="w-full"
              >
                {loadingGitHub ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <GitHubIcon className="h-4 w-4 mr-2" />
                    Sign in with GitHub
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
