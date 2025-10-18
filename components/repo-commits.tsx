'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { GitCommit, Calendar, User } from 'lucide-react'

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
    <div className="space-y-3 pb-6">
      {commits.map((commit) => (
        <Card key={commit.sha} className="p-4 hover:bg-muted/50 transition-colors">
          <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="block">
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
                    <p className="font-medium text-sm leading-tight mb-1">{commit.commit.message.split('\n')[0]}</p>
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
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-shrink-0">{commit.sha.substring(0, 7)}</code>
                </div>
              </div>
            </div>
          </a>
        </Card>
      ))}
    </div>
  )
}
