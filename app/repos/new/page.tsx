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
import { File } from 'lucide-react'

// Template configuration
const REPO_TEMPLATES = [
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'React framework for production',
    cloneUrl: 'https://github.com/ctate/next-template.git',
    imageLight: '/templates/nextjs-light.svg',
    imageDark: '/templates/nextjs-dark.svg',
  },
  {
    id: 'svelte',
    name: 'Svelte',
    description: 'Cybernetically enhanced web apps',
    cloneUrl: 'https://github.com/ctate/svelte-template.git',
    imageLight: '/templates/svelte.svg',
    imageDark: '/templates/svelte.svg',
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    description: 'The Intuitive Vue Framework',
    cloneUrl: 'https://github.com/ctate/nuxt-template.git',
    imageLight: '/templates/nuxt.svg',
    imageDark: '/templates/nuxt.svg',
  },
  {
    id: 'hono',
    name: 'Hono',
    description: 'Fast, lightweight web framework',
    cloneUrl: 'https://github.com/ctate/hono-template.git',
    imageLight: '/templates/hono.svg',
    imageDark: '/templates/hono.svg',
  },
  {
    id: 'empty',
    name: 'Empty',
    description: 'Start with an empty repository',
    cloneUrl: undefined,
    imageLight: '/templates/empty.svg',
    imageDark: '/templates/empty.svg',
  },
] as const

interface Organization {
  login: string
  name: string
  avatar_url: string
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
  const [selectedTemplate, setSelectedTemplate] = useState('nextjs')
  const [selectedOwner, setSelectedOwner] = useState(ownerParam || session.user?.username || '')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)

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
          template: template ? template : undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Repository created successfully')

        // Store the newly created repo info for selection after redirect
        const [owner, repo] = data.full_name.split('/')
        localStorage.setItem('newly-created-repo', JSON.stringify({ owner, repo }))

        // Clear repos cache for current owner to force refresh
        if (selectedOwner) {
          localStorage.removeItem(`github-repos-${selectedOwner}`)
        }

        // Redirect to home page
        router.push('/')
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
              <GitHubStarsButton initialStars={1200} />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="repo-owner">Owner</Label>
                <Select
                  value={selectedOwner}
                  onValueChange={setSelectedOwner}
                  disabled={isCreatingRepo || isLoadingOrgs}
                >
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="repo-name">Repository Name</Label>
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
              </div>
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
              <Label>Template</Label>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {REPO_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplate(template.id)}
                    disabled={isCreatingRepo}
                    className={`relative group transition-all ${
                      isCreatingRepo ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    {/* Mobile List View */}
                    <div
                      className={`md:hidden flex items-center gap-3 p-3 rounded-md border-2 transition-all ${
                        selectedTemplate === template.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 text-foreground">
                        {template.id === 'empty' ? (
                          <File className="w-7 h-7" strokeWidth={1} />
                        ) : (
                          <>
                            <img
                              src={template.imageLight}
                              alt={template.name}
                              className="max-w-[75%] max-h-[75%] w-auto h-auto object-contain dark:hidden"
                            />
                            <img
                              src={template.imageDark}
                              alt={template.name}
                              className="max-w-[75%] max-h-[75%] w-auto h-auto object-contain hidden dark:block"
                            />
                          </>
                        )}
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-sm">{template.name}</div>
                      </div>
                      {selectedTemplate === template.id && (
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-3 h-3"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Desktop Card View */}
                    <div className="hidden md:block">
                      <div
                        className={`aspect-video rounded-md overflow-hidden bg-muted mb-2 border-2 transition-all flex items-center justify-center text-foreground ${
                          selectedTemplate === template.id ? 'border-primary' : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {template.id === 'empty' ? (
                          <File className="w-12 h-12" strokeWidth={1} />
                        ) : (
                          <>
                            <img
                              src={template.imageLight}
                              alt={template.name}
                              className="max-w-[75%] max-h-[75%] w-auto h-auto object-contain dark:hidden"
                            />
                            <img
                              src={template.imageDark}
                              alt={template.name}
                              className="max-w-[75%] max-h-[75%] w-auto h-auto object-contain hidden dark:block"
                            />
                          </>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-xs text-muted-foreground">{template.name}</div>
                      </div>
                      {selectedTemplate === template.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-3 h-3"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="repo-private" className="text-sm font-medium">
                Private repository
              </Label>
              <Switch
                id="repo-private"
                checked={newRepoPrivate}
                onCheckedChange={setNewRepoPrivate}
                disabled={isCreatingRepo}
              />
            </div>

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
