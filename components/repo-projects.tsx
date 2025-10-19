'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { FolderKanban, Calendar, ExternalLink, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  name: string
  framework?: string | null
  link?: {
    type: string
    repo: string
    repoId: number
  }
  latestDeployments?: Array<{
    url: string
    state: string
    ready: boolean
    createdAt: number
  }>
  createdAt?: number
  updatedAt?: number
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
          if (response.status === 401) {
            throw new Error('Vercel authentication required')
          }
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
          <p className="mt-2 text-sm text-muted-foreground">Loading Vercel projects...</p>
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
          {error.includes('authentication') && (
            <p className="text-xs text-muted-foreground mt-2">
              Please sign in with Vercel to view projects for this repository.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FolderKanban className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Vercel Projects Found</h3>
          <p className="text-sm text-muted-foreground">This repository has no Vercel projects linked to it yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-6">
      {projects.map((project) => {
        const latestDeployment = project.latestDeployments?.[0]
        const productionUrl = latestDeployment?.url ? `https://${latestDeployment.url}` : null

        return (
          <Card key={project.id} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 76 65" className="h-4 w-4 text-white dark:text-black" fill="currentColor">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm leading-tight">{project.name}</p>
                      {project.framework && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{project.framework}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      {project.updatedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Updated {formatDistanceToNow(new Date(project.updatedAt))}
                        </span>
                      )}
                      {latestDeployment && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            latestDeployment.ready
                              ? 'bg-green-500/10 text-green-500'
                              : latestDeployment.state === 'ERROR'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-yellow-500/10 text-yellow-500'
                          }`}
                        >
                          {latestDeployment.state}
                        </span>
                      )}
                    </div>
                    {productionUrl && (
                      <div className="flex items-center gap-2">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                          <a href={productionUrl} target="_blank" rel="noopener noreferrer">
                            <Globe className="h-3 w-3 mr-1" />
                            Visit Site
                          </a>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <a href={`https://vercel.com/${project.name}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Dashboard
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
