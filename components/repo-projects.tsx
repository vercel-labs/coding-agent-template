'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { FolderKanban, Calendar, User } from 'lucide-react'

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

interface Project {
  id: string
  title: string
  shortDescription: string | null
  number: number
  closed: boolean
  url: string
  createdAt: string
  updatedAt: string
  creator: {
    login: string
    avatarUrl: string
  } | null
}

interface RepoProjectsProps {
  owner: string
  repo: string
}

export function RepoProjects({ owner, repo }: RepoProjectsProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProjects() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/repos/${owner}/${repo}/projects`)
        if (!response.ok) {
          throw new Error('Failed to fetch projects')
        }
        const data = await response.json()
        setProjects(data.projects || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [owner, repo])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-muted-foreground">Loading projects...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Projects</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FolderKanban className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Projects Found</h3>
          <p className="text-sm text-muted-foreground">This repository has no projects yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-6">
      {projects.map((project) => (
        <Card key={project.id} className="p-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="h-5 w-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <a href={project.url} target="_blank" rel="noopener noreferrer" className="block">
                    <p className="font-medium text-sm leading-tight mb-1 hover:underline">{project.title}</p>
                  </a>
                  {project.shortDescription && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{project.shortDescription}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {project.creator && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {project.creator.login}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Updated {formatDistanceToNow(new Date(project.updatedAt))}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        !project.closed ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'
                      }`}
                    >
                      {project.closed ? 'closed' : 'open'}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">#{project.number}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
