'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useTasks } from '@/components/app-layout'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RepoCommits } from '@/components/repo-commits'
import { RepoPullRequests } from '@/components/repo-pull-requests'
import { GitBranch, GitPullRequest } from 'lucide-react'

interface RepoPageClientProps {
  owner: string
  repo: string
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
}

export function RepoPageClient({ owner, repo, user, authProvider, initialStars = 1200 }: RepoPageClientProps) {
  const { toggleSidebar } = useTasks()
  const [activeTab, setActiveTab] = useState('commits')

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-fit mb-4">
            <TabsTrigger value="commits" className="flex items-center gap-1.5">
              <GitBranch className="h-4 w-4" />
              Commits
            </TabsTrigger>
            <TabsTrigger value="pull-requests" className="flex items-center gap-1.5">
              <GitPullRequest className="h-4 w-4" />
              Pull Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commits" className="flex-1 min-h-0 overflow-auto">
            <RepoCommits owner={owner} repo={repo} />
          </TabsContent>

          <TabsContent value="pull-requests" className="flex-1 min-h-0 overflow-auto">
            <RepoPullRequests owner={owner} repo={repo} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
