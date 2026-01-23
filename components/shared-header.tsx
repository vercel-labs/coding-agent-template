'use client'

import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { useTasks } from '@/components/app-layout'
import { User } from '@/components/auth/user'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'

interface SharedHeaderProps {
  leftActions?: React.ReactNode
  extraActions?: React.ReactNode
  initialStars?: number
  hideStars?: boolean
  hideDeployButton?: boolean
}

export function SharedHeader({
  leftActions,
  extraActions,
  initialStars = 1200,
  hideStars = false,
  hideDeployButton = false,
}: SharedHeaderProps) {
  const { toggleSidebar } = useTasks()

  return (
    <div className="px-0 pt-0.5 md:pt-3 pb-1.5 md:pb-4 overflow-visible">
      <div className="flex items-center justify-between gap-2 h-8 min-w-0">
        {/* Left side - Menu Button and Left Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <Button onClick={toggleSidebar} variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
            <Menu className="h-4 w-4" />
          </Button>
          {leftActions}
        </div>

        {/* Actions - Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!hideStars && <GitHubStarsButton initialStars={initialStars} />}

          {!hideDeployButton && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 sm:px-3 px-0 sm:w-auto w-8 bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
            >
              <a
                href={VERCEL_DEPLOY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5"
              >
                <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                <span className="hidden sm:inline">Deploy Your Own</span>
              </a>
            </Button>
          )}

          {extraActions}

          <User />
        </div>
      </div>
    </div>
  )
}
