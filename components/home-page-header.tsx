'use client'

import { PageHeader } from '@/components/page-header'
import { RepoSelector } from '@/components/repo-selector'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'

interface HomePageHeaderProps {
  selectedOwner: string
  selectedRepo: string
  onOwnerChange: (owner: string) => void
  onRepoChange: (repo: string) => void
  user?: Session['user'] | null
}

export function HomePageHeader({ selectedOwner, selectedRepo, onOwnerChange, onRepoChange, user }: HomePageHeaderProps) {
  const { toggleSidebar } = useTasks()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefreshRepos = async () => {
    setIsRefreshing(true)
    try {
      // Clear all GitHub-related caches
      sessionStorage.removeItem('github-owners')
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('github-repos-')) {
          sessionStorage.removeItem(key)
        }
      })

      // Reload the page to fetch fresh data
      window.location.reload()
    } catch (error) {
      console.error('Error refreshing repositories:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const actions = (
    <div className="flex items-center gap-2">
      {/* Deploy to Vercel Button */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
      >
        <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
          Deploy to Vercel
        </a>
      </Button>

      {/* User Authentication */}
      <User user={user} />
    </div>
  )

  const leftActions = (
    <div className="flex items-center gap-2">
      <RepoSelector
        selectedOwner={selectedOwner}
        selectedRepo={selectedRepo}
        onOwnerChange={onOwnerChange}
        onRepoChange={onRepoChange}
        size="sm"
      />
      <Button
        onClick={handleRefreshRepos}
        disabled={isRefreshing}
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        title="Refresh Repositories"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
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
    </>
  )
}
