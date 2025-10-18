'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CircleDot, Calendar, MessageSquare } from 'lucide-react'

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

interface Issue {
  number: number
  title: string
  state: 'open' | 'closed'
  user: {
    login: string
    avatar_url: string
  }
  created_at: string
  updated_at: string
  html_url: string
  comments: number
  labels: {
    name: string
    color: string
  }[]
}

interface RepoIssuesProps {
  owner: string
  repo: string
}

export function RepoIssues({ owner, repo }: RepoIssuesProps) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchIssues() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/repos/${owner}/${repo}/issues`)
        if (!response.ok) {
          throw new Error('Failed to fetch issues')
        }
        const data = await response.json()
        setIssues(data.issues || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load issues')
      } finally {
        setLoading(false)
      }
    }

    fetchIssues()
  }, [owner, repo])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-muted-foreground">Loading issues...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Issues</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <CircleDot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
          <p className="text-sm text-muted-foreground">This repository has no open issues.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-6">
      {issues.map((issue) => (
        <Card key={issue.number} className="p-4 hover:bg-muted/50 transition-colors">
          <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <CircleDot className={`h-5 w-5 ${issue.state === 'open' ? 'text-green-500' : 'text-purple-500'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight mb-1">{issue.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>#{issue.number}</span>
                      <span>•</span>
                      <span>
                        {issue.state === 'open' ? 'opened' : 'closed'} {formatDistanceToNow(new Date(issue.created_at))}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      variant={issue.state === 'open' ? 'default' : 'secondary'}
                      className={`text-xs ${issue.state === 'open' ? 'bg-green-500 hover:bg-green-600' : ''}`}
                    >
                      {issue.state === 'open' ? 'Open' : 'Closed'}
                    </Badge>
                  </div>
                </div>

                {issue.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {issue.labels.map((label) => (
                      <Badge
                        key={label.name}
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: `#${label.color}`,
                          backgroundColor: `#${label.color}20`,
                        }}
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <img src={issue.user.avatar_url} alt={issue.user.login} className="h-4 w-4 rounded-full" />
                    {issue.user.login}
                  </span>
                  {issue.comments > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {issue.comments}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Updated {formatDistanceToNow(new Date(issue.updated_at))}
                  </span>
                </div>
              </div>
            </div>
          </a>
        </Card>
      ))}
    </div>
  )
}
