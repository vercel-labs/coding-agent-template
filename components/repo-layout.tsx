'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useTasks } from '@/components/app-layout'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'
import { GitHubStarsButton } from '@/components/github-stars-button'
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
  const { toggleSidebar } = useTasks()
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

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <PageHeader
          showMobileMenu={true}
          onToggleMobileMenu={toggleSidebar}
          leftActions={
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {owner}/{repo}
              </h1>
            </div>
          }
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
