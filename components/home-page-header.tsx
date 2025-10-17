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
import { MoreHorizontal, RefreshCw, Unlink, Settings, Plus } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
  initialStars = 1056,
}: HomePageHeaderProps) {
  const { toggleSidebar } = useTasks()
  const router = useRouter()
  const githubConnection = useAtomValue(githubConnectionAtom)
  const githubConnectionInitialized = useAtomValue(githubConnectionInitializedAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showNewRepoDialog, setShowNewRepoDialog] = useState(false)
  const [isCreatingRepo, setIsCreatingRepo] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoDescription, setNewRepoDescription] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(true)

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

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) {
      toast.error('Repository name is required')
      return
    }

    setIsCreatingRepo(true)
    try {
      const response = await fetch('/api/github/repos/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: newRepoDescription.trim(),
          private: newRepoPrivate,
          owner: selectedOwner,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Repository created successfully')

        // Clear repos cache for current owner
        if (selectedOwner) {
          localStorage.removeItem(`github-repos-${selectedOwner}`)
        }

        // Set the newly created repo as selected
        onRepoChange(data.name)

        // Reset form
        setNewRepoName('')
        setNewRepoDescription('')
        setNewRepoPrivate(true)
        setShowNewRepoDialog(false)

        // Reload the page to refresh repos list
        window.location.reload()
      } else {
        toast.error(data.error || 'Failed to create repository')
      }
    } catch (error) {
      console.error('Error creating repository:', error)
      toast.error('Failed to create repository')
    } finally {
      setIsCreatingRepo(false)
    }
  }

  const actions = (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* GitHub Stars Button - Hidden on mobile */}
      <div className="hidden md:block">
        <GitHubStarsButton initialStars={initialStars} />
      </div>

      {/* Deploy to Vercel Button - Hidden on mobile */}
      <div className="hidden md:block">
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
              <DropdownMenuItem onClick={() => setShowNewRepoDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Repo
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

      {/* New Repository Dialog */}
      <Dialog open={showNewRepoDialog} onOpenChange={setShowNewRepoDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Repository</DialogTitle>
            <DialogDescription>
              Create a new GitHub repository{selectedOwner ? ` for ${selectedOwner}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="repo-name">Repository Name *</Label>
              <Input
                id="repo-name"
                placeholder="my-awesome-project"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                disabled={isCreatingRepo}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleCreateRepo()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Use lowercase letters, numbers, hyphens, and underscores.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo-description">Description (optional)</Label>
              <Textarea
                id="repo-description"
                placeholder="A brief description of your project"
                value={newRepoDescription}
                onChange={(e) => setNewRepoDescription(e.target.value)}
                disabled={isCreatingRepo}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label
                htmlFor="repo-private"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Private repository
              </Label>
              <Switch
                id="repo-private"
                checked={newRepoPrivate}
                onCheckedChange={setNewRepoPrivate}
                disabled={isCreatingRepo}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNewRepoDialog(false)
                setNewRepoName('')
                setNewRepoDescription('')
                setNewRepoPrivate(true)
              }}
              disabled={isCreatingRepo}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateRepo} disabled={isCreatingRepo || !newRepoName.trim()}>
              {isCreatingRepo ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Repository'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
