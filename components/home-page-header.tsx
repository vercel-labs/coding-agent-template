'use client'

import { PageHeader } from '@/components/page-header'
import { RepoSelector } from '@/components/repo-selector'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, RefreshCw, Unlink, Settings, Plus, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useSetAtom, useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { githubConnectionAtom, githubConnectionInitializedAtom } from '@/lib/atoms/github-connection'
import { GitHubIcon } from '@/components/icons/github-icon'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { OpenRepoUrlDialog } from '@/components/open-repo-url-dialog'
import { useTasks as useTasksContext } from '@/components/app-layout'

interface HomePageHeaderProps {
  selectedOwner: string
  selectedRepo: string
  onOwnerChange: (owner: string) => void
  onRepoChange: (repo: string) => void
  user?: Session['user'] | null
  initialStars?: number
}

export function HomePageHeader({
  selectedOwner,
  selectedRepo,
  onOwnerChange,
  onRepoChange,
  user,
  initialStars = 1200,
}: HomePageHeaderProps) {
  const { toggleSidebar } = useTasks()
  const routerNav = useRouter()
  const githubConnection = useAtomValue(githubConnectionAtom)
  const githubConnectionInitialized = useAtomValue(githubConnectionInitializedAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showOpenRepoDialog, setShowOpenRepoDialog] = useState(false)
  const { addTaskOptimistically } = useTasksContext()

  const handleRefreshOwners = async () => {
    setIsRefreshing(true)
    try {
      // Clear only owners cache
      localStorage.removeItem('github-owners')
      toast.success('Refreshing owners...')

      // Reload the page to fetch fresh data
      window.location.reload()
    } catch (error) {
      console.error('Error refreshing owners:', error)
      toast.error('Failed to refresh owners')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleRefreshRepos = async () => {
    setIsRefreshing(true)
    try {
      // Clear repos cache for current owner
      if (selectedOwner) {
        localStorage.removeItem(`github-repos-${selectedOwner}`)
        toast.success('Refreshing repositories...')

        // Reload the page to fetch fresh data
        window.location.reload()
      } else {
        // Clear all repos if no owner selected
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('github-repos-')) {
            localStorage.removeItem(key)
          }
        })
        toast.success('Refreshing all repositories...')
        window.location.reload()
      }
    } catch (error) {
      console.error('Error refreshing repositories:', error)
      toast.error('Failed to refresh repositories')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    try {
      const response = await fetch('/api/auth/github/disconnect', {
        method: 'POST',
        credentials: 'include', // Ensure cookies are sent
      })

      if (response.ok) {
        toast.success('GitHub disconnected')

        // Clear GitHub data from localStorage
        localStorage.removeItem('github-owners')
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('github-repos-')) {
            localStorage.removeItem(key)
          }
        })

        // Clear selected owner/repo
        onOwnerChange('')
        onRepoChange('')

        // Update connection state
        setGitHubConnection({ connected: false })

        // Refresh the page
        routerNav.refresh()
      } else {
        const error = await response.json()
        console.error('Failed to disconnect GitHub:', error)
        toast.error(error.error || 'Failed to disconnect GitHub')
      }
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error)
      toast.error('Failed to disconnect GitHub')
    }
  }

  const handleNewRepo = () => {
    // Navigate to the new repo page with owner as query param
    const url = selectedOwner ? `/repos/new?owner=${selectedOwner}` : '/repos/new'
    routerNav.push(url)
  }

  const handleOpenRepoUrl = async (repoUrl: string) => {
    try {
      if (!user) {
        toast.error('Sign in required', {
          description: 'Please sign in to create tasks with custom repository URLs.',
        })
        return
      }

      // Create a task with the provided repo URL
      // Use default settings for the task
      const taskData = {
        prompt: 'Work on this repository',
        repoUrl: repoUrl,
        selectedAgent: localStorage.getItem('last-selected-agent') || 'claude',
        selectedModel: localStorage.getItem('last-selected-model-claude') || 'claude-sonnet-4-5-20250929',
        installDependencies: true,
        maxDuration: 300,
        keepAlive: false,
      }

      // Add task optimistically to sidebar immediately
      const { id } = addTaskOptimistically(taskData)

      // Navigate to the new task page immediately
      routerNav.push(`/tasks/${id}`)

      // Create the task on the server
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...taskData, id }),
      })

      if (response.ok) {
        toast.success('Task created successfully!')
      } else {
        const error = await response.json()
        toast.error(error.message || error.error || 'Failed to create task')
      }
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Failed to create task')
    }
  }

  const actions = (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* GitHub Stars Button - Show on mobile only when logged out, always show on desktop */}
      <div className={user ? 'hidden md:block' : 'block'}>
        <GitHubStarsButton initialStars={initialStars} />
      </div>

      {/* Deploy to Vercel Button - Show on mobile only when logged out, always show on desktop */}
      <div className={user ? 'hidden md:block' : 'block'}>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 px-3 bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
        >
          <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
            <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
            <span>Deploy Your Own</span>
          </a>
        </Button>
      </div>

      {/* User Authentication */}
      <User user={user} />
    </div>
  )

  const handleConnectGitHub = () => {
    window.location.href = '/api/auth/github/signin'
  }

  const handleReconfigureGitHub = () => {
    // Link to GitHub's OAuth app settings page where users can reconfigure access
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    if (clientId) {
      window.open(`https://github.com/settings/connections/applications/${clientId}`, '_blank')
    } else {
      // Fallback to OAuth flow if client ID is not available
      window.location.href = '/api/auth/github/signin'
    }
  }

  // Get session to check auth provider
  const session = useAtomValue(sessionAtom)
  // Check if user is authenticated with GitHub (not just connected)
  const isGitHubAuthUser = session.authProvider === 'github'

  // Always render leftActions container to prevent layout shift
  const leftActions = (
    <div className="flex items-center gap-1 sm:gap-2 h-8 min-w-0 flex-1">
      {!githubConnectionInitialized ? null : githubConnection.connected || isGitHubAuthUser ? ( // Show nothing while loading to prevent flash of "Connect GitHub" button
        <>
          <RepoSelector
            selectedOwner={selectedOwner}
            selectedRepo={selectedRepo}
            onOwnerChange={onOwnerChange}
            onRepoChange={onRepoChange}
            size="sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0" title="More options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleNewRepo}>
                <Plus className="h-4 w-4 mr-2" />
                New Repo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowOpenRepoDialog(true)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Repo URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleRefreshOwners} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Owners
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRefreshRepos} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Repos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReconfigureGitHub}>
                <Settings className="h-4 w-4 mr-2" />
                Manage Access
              </DropdownMenuItem>
              {/* Only show Disconnect for Vercel users who connected GitHub, not for GitHub-authenticated users */}
              {!isGitHubAuthUser && (
                <DropdownMenuItem onClick={handleDisconnectGitHub}>
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect GitHub
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : user ? (
        <Button onClick={handleConnectGitHub} variant="outline" size="sm" className="h-8 flex-shrink-0">
          <GitHubIcon className="h-4 w-4 mr-2" />
          Connect GitHub
        </Button>
      ) : null}
    </div>
  )

  return (
    <>
      <PageHeader
        showMobileMenu={true}
        onToggleMobileMenu={toggleSidebar}
        actions={actions}
        leftActions={leftActions}
      />
      <OpenRepoUrlDialog open={showOpenRepoDialog} onOpenChange={setShowOpenRepoDialog} onSubmit={handleOpenRepoUrl} />
    </>
  )
}
