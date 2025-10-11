'use client'

import { PageHeader } from '@/components/page-header'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { GitHubStarsButton } from '@/components/github-stars-button'

export default function TaskLoading() {
  const { toggleSidebar } = useTasks()

  // Placeholder actions for loading state - no user avatar to prevent flash
  const loadingActions = (
    <div className="flex items-center gap-2 h-8">
      <GitHubStarsButton />
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
      {/* Empty spacer to reserve space for user avatar */}
      <div className="w-8" />
    </div>
  )

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <PageHeader showMobileMenu={true} onToggleMobileMenu={toggleSidebar} actions={loadingActions} />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading task...</p>
        </div>
      </div>
    </div>
  )
}
