'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { SharedHeader } from '@/components/shared-header'
import { Button } from '@/components/ui/button'
import type { Session } from '@/lib/session/types'
import { cn } from '@/lib/utils'
import { setSelectedOwner, setSelectedRepo } from '@/lib/utils/cookies'
import { Plus } from 'lucide-react'

interface RepoLayoutProps {
  owner: string
  repo: string
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
  children: React.ReactNode
}

export function RepoLayout({ owner, repo, user, authProvider, initialStars = 1200, children }: RepoLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()

  const tabs = [
    { name: 'Commits', href: `/repos/${owner}/${repo}/commits` },
    { name: 'Issues', href: `/repos/${owner}/${repo}/issues` },
    { name: 'Pull Requests', href: `/repos/${owner}/${repo}/pull-requests` },
  ]

  const handleNewTask = () => {
    // Set the owner/repo cookies so they're populated on the homepage
    setSelectedOwner(owner)
    setSelectedRepo(repo)
    // Navigate to homepage
    router.push('/')
  }

  const headerLeftActions = (
    <div className="flex items-center gap-2 min-w-0">
      <h1 className="text-lg font-semibold truncate">
        {owner}/{repo}
      </h1>
    </div>
  )

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <SharedHeader leftActions={headerLeftActions} initialStars={initialStars} />
      </div>

      {/* Main content with tabs */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-3">
        <div className="flex-shrink-0 border-b border-border mb-4">
          <nav className="flex items-center gap-6" aria-label="Repository navigation">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors',
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {tab.name}
                </Link>
              )
            })}
            <Button
              onClick={handleNewTask}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 -mb-[1px] text-muted-foreground hover:text-foreground"
              title="Create new task with this repository"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </nav>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
