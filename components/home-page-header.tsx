'use client'

import { PageHeader } from '@/components/page-header'
import { RepoSelector } from '@/components/repo-selector'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, RefreshCw, Unlink, Settings } from 'lucide-react'
import { useState } from 'react'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useSetAtom, useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { githubConnectionAtom } from '@/lib/atoms/github-connection'
import { GitHubIcon } from '@/components/icons/github-icon'

interface HomePageHeaderProps {
  selectedOwner: string
  selectedRepo: string
  onOwnerChange: (owner: string) => void
  onRepoChange: (repo: string) => void
  user?: Session['user'] | null
}

export function HomePageHeader({
  selectedOwner,
  selectedRepo,
  onOwnerChange,
  onRepoChange,
  user,
}: HomePageHeaderProps) {
  const { toggleSidebar } = useTasks()
  const router = useRouter()
  const githubConnection = useAtomValue(githubConnectionAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefreshOwners = async () => {
    setIsRefreshing(true)
    try {
      // Clear only owners cache
      sessionStorage.removeItem('github-owners')
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
        sessionStorage.removeItem(`github-repos-${selectedOwner}`)
        toast.success('Refreshing repositories...')

        // Reload the page to fetch fresh data
        window.location.reload()
      } else {
        // Clear all repos if no owner selected
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith('github-repos-')) {
            sessionStorage.removeItem(key)
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
        setGitHubConnection({ connected: false })
        router.refresh()
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

  const actions = (
    <div className="flex items-center gap-2">
      {/* Deploy to Vercel Button */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 sm:px-3 px-0 sm:w-auto w-8 bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
      >
        <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
          <span className="hidden sm:inline">Deploy Your Own</span>
        </a>
      </Button>

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

  const leftActions =
    githubConnection.connected || isGitHubAuthUser ? (
      <div className="flex items-center gap-2">
        <RepoSelector
          selectedOwner={selectedOwner}
          selectedRepo={selectedRepo}
          onOwnerChange={onOwnerChange}
          onRepoChange={onRepoChange}
          size="sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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
      </div>
    ) : user ? (
      <Button onClick={handleConnectGitHub} variant="outline" size="sm" className="h-8">
        <GitHubIcon className="h-4 w-4 mr-2" />
        Connect GitHub
      </Button>
    ) : null

  return (
    <>
      <PageHeader
        showMobileMenu={true}
        onToggleMobileMenu={toggleSidebar}
        actions={actions}
        leftActions={leftActions}
      />
    </>
  )
}
