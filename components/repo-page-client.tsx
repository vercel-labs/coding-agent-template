'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useTasks } from '@/components/app-layout'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { User } from '@/components/auth/user'
import type { Session } from '@/lib/session/types'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GitCommit, GitPullRequest, Loader2, AlertCircle } from 'lucide-react'

interface RepoPageClientProps {
  owner: string
  repo: string
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
}

interface Commit {
  sha: string
  message: string
  author: {
    name: string
    email: string
    date: string
  }
  html_url: string
}

interface PullRequest {
  number: number
  title: string
  state: string
  created_at: string
  updated_at: string
  user: {
    login: string
    avatar_url: string
  }
  html_url: string
}

export function RepoPageClient({ owner, repo, user, authProvider, initialStars = 1056 }: RepoPageClientProps) {
  const { toggleSidebar } = useTasks()
  const [commits, setCommits] = useState<Commit[]>([])
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [isLoadingCommits, setIsLoadingCommits] = useState(true)
  const [isLoadingPRs, setIsLoadingPRs] = useState(true)
  const [commitsError, setCommitsError] = useState<string | null>(null)
  const [prsError, setPrsError] = useState<string | null>(null)

  useEffect(() => {
    fetchCommits()
    fetchPullRequests()
  }, [owner, repo])

  const fetchCommits = async () => {
    setIsLoadingCommits(true)
    setCommitsError(null)
    try {
      const response = await fetch(`/api/github/repos/${owner}/${repo}/commits`)
      if (!response.ok) {
        throw new Error('Failed to fetch commits')
      }
      const data = await response.json()
      setCommits(data)
    } catch (error) {
      setCommitsError(error instanceof Error ? error.message : 'Failed to load commits')
    } finally {
      setIsLoadingCommits(false)
    }
  }

  const fetchPullRequests = async () => {
    setIsLoadingPRs(true)
    setPrsError(null)
    try {
      const response = await fetch(`/api/github/repos/${owner}/${repo}/pulls`)
      if (!response.ok) {
        throw new Error('Failed to fetch pull requests')
      }
      const data = await response.json()
      setPullRequests(data)
    } catch (error) {
      setPrsError(error instanceof Error ? error.message : 'Failed to load pull requests')
    } finally {
      setIsLoadingPRs(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

    if (diffInDays === 0) {
      return 'Today'
    } else if (diffInDays === 1) {
      return 'Yesterday'
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  return (
    <div className="flex-1 bg-background">
      <div className="p-3">
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

      <div className="mx-auto p-3 pt-0">
        <Tabs defaultValue="commits" className="w-full">
          <TabsList>
            <TabsTrigger value="commits">
              <GitCommit className="h-4 w-4 mr-2" />
              Commits
            </TabsTrigger>
            <TabsTrigger value="pull-requests">
              <GitPullRequest className="h-4 w-4 mr-2" />
              Pull Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commits" className="mt-4">
            <div className="bg-card rounded-md border overflow-hidden">
              {isLoadingCommits ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : commitsError ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                    <p className="text-muted-foreground">{commitsError}</p>
                  </div>
                </div>
              ) : commits.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">No commits found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {commits.map((commit) => (
                    <a
                      key={commit.sha}
                      href={commit.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <GitCommit className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm mb-1 break-words">{commit.message.split('\n')[0]}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{commit.author.name}</span>
                            <span>•</span>
                            <span>{formatDate(commit.author.date)}</span>
                            <span>•</span>
                            <code className="font-mono text-xs">{commit.sha.substring(0, 7)}</code>
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pull-requests" className="mt-4">
            <div className="bg-card rounded-md border overflow-hidden">
              {isLoadingPRs ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : prsError ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                    <p className="text-muted-foreground">{prsError}</p>
                  </div>
                </div>
              ) : pullRequests.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">No open pull requests</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pullRequests.map((pr) => (
                    <a
                      key={pr.number}
                      href={pr.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <GitPullRequest className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm mb-1 break-words">{pr.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>#{pr.number}</span>
                            <span>•</span>
                            <span>by {pr.user.login}</span>
                            <span>•</span>
                            <span>opened {formatDate(pr.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
