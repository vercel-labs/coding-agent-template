'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { useTasks } from '@/components/app-layout'
import { User } from '@/components/auth/user'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'

// Template configuration
const REPO_TEMPLATES = [
  {
    id: 'none',
    name: 'None',
    description: 'Create an empty repository',
  },
  {
    id: 'nextjs-boilerplate',
    name: 'Next.js Boilerplate',
    description: 'Next.js starter from Vercel',
    sourceRepo: 'https://github.com/vercel/vercel',
    sourceFolder: 'examples/nextjs',
  },
] as const

interface Organization {
  login: string
  name: string
  avatar_url: string
}

interface VercelScope {
  id: string
  slug: string
  name: string
  type: 'personal' | 'team'
}

export default function NewRepoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ownerParam = searchParams.get('owner') || ''
  const { toggleSidebar } = useTasks()
  const session = useAtomValue(sessionAtom)

  const [isCreatingRepo, setIsCreatingRepo] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoDescription, setNewRepoDescription] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState('nextjs-boilerplate')
  const [selectedOwner, setSelectedOwner] = useState(ownerParam || session.user?.username || '')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)

  // Vercel-specific state
  const [vercelScopes, setVercelScopes] = useState<VercelScope[]>([])
  const [selectedVercelScope, setSelectedVercelScope] = useState('')
  const [vercelProjectName, setVercelProjectName] = useState('')
  const [isLoadingVercelScopes, setIsLoadingVercelScopes] = useState(false)

  // Fetch organizations when component mounts
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await fetch('/api/github/orgs')
        if (response.ok) {
          const orgs = await response.json()
          setOrganizations(orgs)
        }
      } catch (error) {
        console.error('Error fetching organizations:', error)
      } finally {
        setIsLoadingOrgs(false)
      }
    }

    if (session.user) {
      fetchOrganizations()
    } else {
      setIsLoadingOrgs(false)
    }
  }, [session.user])

  // Fetch Vercel scopes when user is logged in via Vercel
  useEffect(() => {
    const fetchVercelScopes = async () => {
      setIsLoadingVercelScopes(true)
      try {
        const response = await fetch('/api/vercel/teams')
        if (response.ok) {
          const data = await response.json()
          setVercelScopes(data.scopes || [])
          // Set default scope to personal account
          if (data.scopes && data.scopes.length > 0) {
            setSelectedVercelScope(data.scopes[0].id)
          }
        }
      } catch (error) {
        console.error('Error fetching Vercel scopes:', error)
      } finally {
        setIsLoadingVercelScopes(false)
      }
    }

    if (session.authProvider === 'vercel') {
      fetchVercelScopes()
    }
  }, [session.authProvider])

  // Update selected owner when ownerParam or session changes
  useEffect(() => {
    if (ownerParam) {
      setSelectedOwner(ownerParam)
    } else if (session.user?.username) {
      setSelectedOwner(session.user.username)
    } else {
      setSelectedOwner('')
    }
  }, [ownerParam, session.user])

  // Update Vercel project name to match repo name by default
  useEffect(() => {
    if (session.authProvider === 'vercel') {
      setVercelProjectName(newRepoName)
    }
  }, [newRepoName, session.authProvider])

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) {
      toast.error('Repository name is required')
      return
    }

    setIsCreatingRepo(true)
    try {
      const template = REPO_TEMPLATES.find((t) => t.id === selectedTemplate)

      const response = await fetch('/api/github/repos/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: newRepoDescription.trim(),
          private: newRepoPrivate,
          owner: selectedOwner,
          template: template && template.id !== 'none' ? template : undefined,
          // Vercel project data (only for Vercel users)
          vercel:
            session.authProvider === 'vercel' && selectedVercelScope && vercelProjectName
              ? {
                  teamId: selectedVercelScope,
                  projectName: vercelProjectName.trim(),
                }
              : undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Repository created successfully')

        // Clear repos cache for current owner
        if (selectedOwner) {
          localStorage.removeItem(`github-repos-${selectedOwner}`)
        }

        // Redirect to home page and reload to refresh repos list
        router.push('/')
        window.location.reload()
      } else {
        toast.error(data.error || 'Failed to create repository')
      }
    } catch (error) {
      console.error('Error creating repository:', error)
      toast.error('Failed to create repository')
    } finally {
      setIsCreatingRepo(false)
    }
  }

  const handleCancel = () => {
    router.push('/')
  }

  return (
    <div className="flex-1 bg-background">
      <div className="p-3">
        <PageHeader
          showMobileMenu={true}
          onToggleMobileMenu={toggleSidebar}
          actions={
            <div className="flex items-center gap-2 h-8">
              <GitHubStarsButton initialStars={1056} />
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
              <User user={session.user} authProvider={session.authProvider} />
            </div>
          }
        />
      </div>

      <div className="px-3 pb-3">
        <div className="container max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Create New Repository</h1>
            <p className="text-muted-foreground mt-2">
              Create a new GitHub repository{selectedOwner ? ` for ${selectedOwner}` : ''}.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="repo-owner">Owner *</Label>
              <Select value={selectedOwner} onValueChange={setSelectedOwner} disabled={isCreatingRepo || isLoadingOrgs}>
                <SelectTrigger id="repo-owner" className="w-full">
                  <SelectValue placeholder={isLoadingOrgs ? 'Loading...' : 'Select owner'} />
                </SelectTrigger>
                <SelectContent>
                  {session.user && (
                    <SelectItem value={session.user.username}>
                      <div className="flex items-center gap-2">
                        <img src={session.user.avatar} alt={session.user.username} className="w-5 h-5 rounded-full" />
                        <span>{session.user.username}</span>
                      </div>
                    </SelectItem>
                  )}
                  {organizations.map((org) => (
                    <SelectItem key={org.login} value={org.login}>
                      <div className="flex items-center gap-2">
                        <img src={org.avatar_url} alt={org.login} className="w-5 h-5 rounded-full" />
                        <span>{org.login}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose which account or organization will own this repository.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo-name">Repository Name *</Label>
              <Input
                id="repo-name"
                placeholder="my-awesome-project"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                disabled={isCreatingRepo}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleCreateRepo()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Use lowercase letters, numbers, hyphens, and underscores.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo-description">Description (optional)</Label>
              <Textarea
                id="repo-description"
                placeholder="A brief description of your project"
                value={newRepoDescription}
                onChange={(e) => setNewRepoDescription(e.target.value)}
                disabled={isCreatingRepo}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo-template">Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate} disabled={isCreatingRepo}>
                <SelectTrigger id="repo-template" className="w-full">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {REPO_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{template.name}</span>
                        <span className="text-xs text-muted-foreground">{template.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose a template to start with pre-configured code, or None for an empty repository.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="repo-private" className="text-sm font-medium">
                  Private repository
                </Label>
                <p className="text-xs text-muted-foreground">Choose who can see this repository</p>
              </div>
              <Switch
                id="repo-private"
                checked={newRepoPrivate}
                onCheckedChange={setNewRepoPrivate}
                disabled={isCreatingRepo}
              />
            </div>

            {/* Vercel Project Section - Only shown for Vercel users */}
            {session.authProvider === 'vercel' && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Vercel Project</h3>
                  <p className="text-xs text-muted-foreground">
                    Optionally configure a Vercel project for this repository.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vercel-scope">Vercel Scope</Label>
                  <Select
                    value={selectedVercelScope}
                    onValueChange={setSelectedVercelScope}
                    disabled={isCreatingRepo || isLoadingVercelScopes}
                  >
                    <SelectTrigger id="vercel-scope" className="w-full">
                      <SelectValue placeholder={isLoadingVercelScopes ? 'Loading...' : 'Select scope'} />
                    </SelectTrigger>
                    <SelectContent>
                      {vercelScopes.map((scope) => (
                        <SelectItem key={scope.id} value={scope.id}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {scope.type === 'personal' ? '👤' : '👥'}
                            </span>
                            <span>{scope.name}</span>
                            <span className="text-xs text-muted-foreground">({scope.slug})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose which Vercel account or team will own this project.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vercel-project-name">Vercel Project Name</Label>
                  <Input
                    id="vercel-project-name"
                    placeholder="my-awesome-project"
                    value={vercelProjectName}
                    onChange={(e) => setVercelProjectName(e.target.value)}
                    disabled={isCreatingRepo}
                  />
                  <p className="text-xs text-muted-foreground">
                    The name of your Vercel project. Defaults to the repository name.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleCancel} disabled={isCreatingRepo}>
                Cancel
              </Button>
              <Button onClick={handleCreateRepo} disabled={isCreatingRepo || !newRepoName.trim()}>
                {isCreatingRepo ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Repository'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
