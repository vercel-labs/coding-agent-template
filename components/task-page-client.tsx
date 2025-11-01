'use client'

import { useState } from 'react'
import { useTask } from '@/lib/hooks/use-task'
import { TaskDetails } from '@/components/task-details'
import { TaskPageHeader } from '@/components/task-page-header'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useTasks } from '@/components/app-layout'
import { LogsPane } from '@/components/logs-pane'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'
import { GitHubStarsButton } from '@/components/github-stars-button'

interface TaskPageClientProps {
  taskId: string
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
  maxSandboxDuration?: number
}

export function TaskPageClient({
  taskId,
  user,
  authProvider,
  initialStars = 1200,
  maxSandboxDuration = 300,
}: TaskPageClientProps) {
  const { task, isLoading, error } = useTask(taskId)
  const { toggleSidebar } = useTasks()
  const [logsPaneHeight, setLogsPaneHeight] = useState(40) // Default to collapsed height

  if (isLoading) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <PageHeader
            showMobileMenu={true}
            onToggleMobileMenu={toggleSidebar}
            actions={
              <div className="flex items-center gap-2 h-8">
                <GitHubStarsButton initialStars={initialStars} />
                {/* Deploy to Vercel Button */}
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

                {/* User Authentication */}
                <User user={user} authProvider={authProvider} />
              </div>
            }
          />
        </div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <PageHeader
            showMobileMenu={true}
            onToggleMobileMenu={toggleSidebar}
            showPlatformName={true}
            actions={
              <div className="flex items-center gap-2 h-8">
                <GitHubStarsButton initialStars={initialStars} />
                {/* Deploy to Vercel Button */}
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
                <User user={user} authProvider={authProvider} />
              </div>
            }
          />
        </div>
        <div className="mx-auto p-3">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-2">Task Not Found</h2>
              <p className="text-muted-foreground">{error || 'The requested task could not be found.'}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <TaskPageHeader task={task} user={user} authProvider={authProvider} initialStars={initialStars} />
      </div>

      {/* Task details */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ paddingBottom: `${logsPaneHeight}px` }}>
        <TaskDetails task={task} maxSandboxDuration={maxSandboxDuration} />
      </div>

      {/* Logs pane at bottom */}
      <LogsPane task={task} onHeightChange={setLogsPaneHeight} />
    </div>
  )
}
