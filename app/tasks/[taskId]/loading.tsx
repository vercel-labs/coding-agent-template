'use client'

import { PageHeader } from '@/components/page-header'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MoreHorizontal } from 'lucide-react'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'

export default function TaskLoading() {
  const { toggleSidebar, isSidebarOpen } = useTasks()

  // Placeholder actions for loading state
  const loadingActions = (
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

      {/* More Actions Menu Placeholder */}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  )

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto p-3">
        <PageHeader
          showMobileMenu={true}
          onToggleMobileMenu={toggleSidebar}
          isMobileSidebarOpen={isSidebarOpen}
          actions={loadingActions}
        />

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Task Info Skeleton */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="h-6 bg-muted animate-pulse rounded w-24"></div>
                  <div className="h-6 bg-muted animate-pulse rounded w-16"></div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-16"></div>
                  <div className="h-16 bg-muted animate-pulse rounded"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-20"></div>
                  <div className="h-4 bg-muted animate-pulse rounded w-48"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-12"></div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 bg-muted animate-pulse rounded"></div>
                    <div className="h-4 bg-muted animate-pulse rounded w-24"></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logs Skeleton */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="h-6 bg-muted animate-pulse rounded w-20"></div>
                  <div className="h-8 bg-muted animate-pulse rounded w-16"></div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 h-96 overflow-hidden">
                  {Array.from({ length: 8 }).map((_, i) => {
                    const widths = ['75%', '85%', '65%', '90%', '70%', '80%', '95%', '60%']
                    return (
                      <div key={i} className="flex gap-2">
                        <div className="h-4 w-12 bg-muted animate-pulse rounded flex-shrink-0"></div>
                        <div className="h-4 bg-muted animate-pulse rounded flex-1" style={{ width: widths[i] }}></div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
