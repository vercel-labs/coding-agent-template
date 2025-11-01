'use client'

import { Task } from '@/lib/db/schema'
import { PageHeader } from '@/components/page-header'
import { TaskActions } from '@/components/task-actions'
import { useTasks } from '@/components/app-layout'
import { User } from '@/components/auth/user'
import { Button } from '@/components/ui/button'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import type { Session } from '@/lib/session/types'
import { GitHubStarsButton } from '@/components/github-stars-button'

interface TaskPageHeaderProps {
  task: Task
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
}

export function TaskPageHeader({ task, user, authProvider, initialStars = 1200 }: TaskPageHeaderProps) {
  const { toggleSidebar } = useTasks()

  return (
    <PageHeader
      showMobileMenu={true}
      onToggleMobileMenu={toggleSidebar}
      showPlatformName={true}
      actions={
        <div className="flex items-center gap-2">
          <GitHubStarsButton initialStars={initialStars} />
          {/* Deploy to Vercel Button */}
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
          <TaskActions task={task} />
          <User user={user} authProvider={authProvider} />
        </div>
      }
    />
  )
}
