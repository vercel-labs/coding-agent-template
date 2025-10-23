'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { GitCommit, Calendar, User, MoreVertical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTasks } from '@/components/app-layout'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RevertCommitDialog } from '@/components/revert-commit-dialog'

function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`
  return `${Math.floor(diffInSeconds / 31536000)} years ago`
}

interface Commit {
  sha: string
  commit: {
    author: {
      name: string
      email: string
      date: string
    }
    message: string
  }
  author: {
    login: string
    avatar_url: string
  } | null
  html_url: string
}

interface RepoCommitsProps {
  owner: string
  repo: string
}

export function RepoCommits({ owner, repo }: RepoCommitsProps) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRevertDialog, setShowRevertDialog] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)
  const { addTaskOptimistically } = useTasks()
  const router = useRouter()

  useEffect(() => {
    async function fetchCommits() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/repos/${owner}/${repo}/commits`)
        if (!response.ok) {
          throw new Error('Failed to fetch commits')
        }
        const data = await response.json()
        setCommits(data.commits || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commits')
      } finally {
        setLoading(false)
      }
    }

    fetchCommits()
  }, [owner, repo])

  const handleOpenRevertDialog = (commit: Commit) => {
    setSelectedCommit(commit)
    setShowRevertDialog(true)
  }

  const handleRevertCommit = async (config: {
    commit: Commit
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
  }) => {
    try {
      const repoUrl = `https://github.com/${owner}/${repo}`
      const commitShortSha = config.commit.sha.substring(0, 7)
      const commitMessage = config.commit.commit.message.split('\n')[0]
      const prompt = `Revert commit ${commitShortSha}: ${commitMessage}`

      // Create task optimistically
      const { id } = addTaskOptimistically({
        prompt,
        repoUrl,
        selectedAgent: config.selectedAgent,
        selectedModel: config.selectedModel,
        installDependencies: config.installDependencies,
        maxDuration: config.maxDuration,
      })

      // Navigate to the new task page
      router.push(`/tasks/${id}`)

      // Submit the task to the backend
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          prompt,
          repoUrl,
          selectedAgent: config.selectedAgent,
          selectedModel: config.selectedModel,
          installDependencies: config.installDependencies,
          maxDuration: config.maxDuration,
          keepAlive: config.keepAlive,
        }),
      })

      if (response.ok) {
        toast.success('Revert task created successfully!')
      } else {
        const error = await response.json()
        toast.error(error.message || error.error || 'Failed to create revert task')
      }
    } catch (error) {
      console.error('Error creating revert task:', error)
      toast.error('Failed to create revert task')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-muted-foreground">Loading commits...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Commits</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <GitCommit className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Commits Found</h3>
          <p className="text-sm text-muted-foreground">This repository has no commits yet.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 pb-6">
        {commits.map((commit) => (
          <Card key={commit.sha} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              {commit.author?.avatar_url ? (
                <img
                  src={commit.author.avatar_url}
                  alt={commit.author.login}
                  className="h-10 w-10 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="block">
                      <p className="font-medium text-sm leading-tight mb-1">{commit.commit.message.split('\n')[0]}</p>
                    </a>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {commit.author?.login || commit.commit.author.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(commit.commit.author.date))}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <code className="text-xs bg-muted px-2 py-1 rounded">{commit.sha.substring(0, 7)}</code>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenRevertDialog(commit)}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Revert
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Revert Commit Dialog */}
      <RevertCommitDialog
        open={showRevertDialog}
        onOpenChange={setShowRevertDialog}
        commit={selectedCommit}
        owner={owner}
        repo={repo}
        onRevert={handleRevertCommit}
      />
    </>
  )
}
