'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock, GitFork, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GitHubOwner {
  login: string
  name: string
  avatar_url: string
}

interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
  stargazers_count?: number
  forks_count?: number
  updated_at?: string
}

interface RepoSelectorProps {
  selectedOwner: string
  selectedRepo: string
  onOwnerChange: (owner: string) => void
  onRepoChange: (repo: string) => void
  disabled?: boolean
  size?: 'sm' | 'default'
}

export function RepoSelector({
  selectedOwner,
  selectedRepo,
  onOwnerChange,
  onRepoChange,
  disabled = false,
  size = 'default',
}: RepoSelectorProps) {
  const [repoFilter, setRepoFilter] = useState('')
  // Initialize with selected owner to prevent flash
  const [owners, setOwners] = useState<GitHubOwner[]>(() => {
    if (selectedOwner) {
      return [
        {
          login: selectedOwner,
          name: selectedOwner,
          avatar_url: `https://github.com/${selectedOwner}.png`,
        },
      ]
    }
    return []
  })
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loadingOwners, setLoadingOwners] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)

  // Ref for the filter input to focus it when dropdown opens
  const filterInputRef = useRef<HTMLInputElement>(null)

  // Load owners on component mount
  useEffect(() => {
    const loadOwners = async () => {
      try {
        // Check cache first
        const cachedOwners = sessionStorage.getItem('github-owners')
        if (cachedOwners) {
          const parsedOwners = JSON.parse(cachedOwners)
          setOwners(parsedOwners)
          setLoadingOwners(false)
          return
        }

        // Fetch both user and organizations
        const [userResponse, orgsResponse] = await Promise.all([fetch('/api/github/user'), fetch('/api/github/orgs')])

        const ownersList: GitHubOwner[] = []
        let personalAccount: GitHubOwner | null = null

        // Get user (personal account)
        if (userResponse.ok) {
          const user = await userResponse.json()
          personalAccount = {
            login: user.login,
            name: user.name || user.login,
            avatar_url: user.avatar_url,
          }
        }

        // Get organizations and sort them
        const organizations: GitHubOwner[] = []
        if (orgsResponse.ok) {
          const orgs = await orgsResponse.json()
          organizations.push(...orgs)
        }

        // Sort organizations by login name
        organizations.sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: 'base' }))

        // Put personal account first, then sorted organizations
        const sortedOwners: GitHubOwner[] = []
        if (personalAccount) {
          sortedOwners.push(personalAccount)
        }
        sortedOwners.push(...organizations)

        setOwners(sortedOwners)
        // Cache the owners
        sessionStorage.setItem('github-owners', JSON.stringify(sortedOwners))
      } catch (error) {
        console.error('Error loading owners:', error)
      } finally {
        setLoadingOwners(false)
      }
    }

    loadOwners()
  }, [])

  // Auto-select user's personal account if no owner is selected and no saved owner exists
  useEffect(() => {
    if (owners.length > 0 && !selectedOwner) {
      // Only auto-select if we have owners loaded and no owner is currently selected
      // This allows the parent component to set a saved owner from cookies first
      const timer = setTimeout(() => {
        if (!selectedOwner && owners.length > 0) {
          // Auto-select the first owner (user's personal account)
          // Since we add the user first in the loadOwners function, owners[0] will be the personal account
          onOwnerChange(owners[0].login)
        }
      }, 100) // Small delay to allow parent component to set saved owner

      return () => clearTimeout(timer)
    }
  }, [owners, selectedOwner, onOwnerChange])

  // Load repos when owner changes
  useEffect(() => {
    if (selectedOwner) {
      const loadRepos = async () => {
        setLoadingRepos(true)
        try {
          // Check cache first
          const cacheKey = `github-repos-${selectedOwner}`
          const cachedRepos = sessionStorage.getItem(cacheKey)
          if (cachedRepos) {
            const parsedRepos = JSON.parse(cachedRepos)
            setRepos(parsedRepos)
            setLoadingRepos(false)
            return
          }

          const response = await fetch(`/api/github/repos?owner=${selectedOwner}`)
          if (response.ok) {
            const reposList = await response.json()
            setRepos(reposList)
            // Cache the repos
            sessionStorage.setItem(cacheKey, JSON.stringify(reposList))
          }
        } catch (error) {
          console.error('Error loading repos:', error)
        } finally {
          setLoadingRepos(false)
        }
      }

      loadRepos()
    } else {
      setRepos([])
    }
  }, [selectedOwner])

  // Focus filter input when dropdown opens
  useEffect(() => {
    if (repoDropdownOpen && filterInputRef.current && repos && repos.length > 0) {
      // Small delay to ensure the dropdown is fully rendered
      setTimeout(() => {
        if (filterInputRef.current) {
          filterInputRef.current.focus()
        }
      }, 100)
    }
  }, [repoDropdownOpen, repos?.length])

  // Filter repos based on search
  const filteredRepos = (repos || []).filter(
    (repo) =>
      repo.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
      repo.description?.toLowerCase().includes(repoFilter.toLowerCase()),
  )

  // Show first 50 filtered repos
  const displayedRepos = filteredRepos.slice(0, 50)
  const hasMoreRepos = filteredRepos.length > 50

  const handleOwnerChange = (value: string) => {
    onOwnerChange(value)
    onRepoChange('') // Reset repo when owner changes
    setRepoFilter('') // Reset filter when owner changes
  }

  const handleRepoChange = (value: string) => {
    onRepoChange(value)
  }

  const triggerClassName =
    size === 'sm'
      ? 'w-auto min-w-[100px] border-0 bg-transparent shadow-none focus:ring-0 h-8 text-xs'
      : 'w-auto min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8'

  const getLanguageColor = (language: string) => {
    const colors: { [key: string]: string } = {
      JavaScript: '#f1e05a',
      TypeScript: '#3178c6',
      Python: '#3572A5',
      Java: '#b07219',
      'C++': '#f34b7d',
      'C#': '#239120',
      PHP: '#4F5D95',
      Ruby: '#701516',
      Go: '#00ADD8',
      Rust: '#dea584',
      Swift: '#fa7343',
      Kotlin: '#A97BFF',
      Dart: '#00B4AB',
      HTML: '#e34c26',
      CSS: '#1572B6',
      Vue: '#4FC08D',
      React: '#61DAFB',
    }
    return colors[language] || '#8b949e'
  }

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'today'
    if (diffInDays === 1) return 'yesterday'
    if (diffInDays < 30) return `${diffInDays} days ago`
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`
    return `${Math.floor(diffInDays / 365)} years ago`
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedOwner}
        onValueChange={handleOwnerChange}
        disabled={disabled || (loadingOwners && !selectedOwner)}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={loadingOwners && !selectedOwner ? 'Loading...' : 'Owner'} />
        </SelectTrigger>
        <SelectContent>
          {owners.map((owner) => (
            <SelectItem key={owner.login} value={owner.login}>
              <div className="flex items-center gap-2">
                <Image
                  src={owner.avatar_url}
                  alt={owner.login}
                  width={16}
                  height={16}
                  className="w-4 h-4 rounded-full"
                />
                <span>{owner.login}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedOwner && (
        <>
          <span className="text-muted-foreground">/</span>

          <Select
            value={selectedRepo}
            onValueChange={handleRepoChange}
            disabled={disabled || loadingRepos}
            onOpenChange={setRepoDropdownOpen}
          >
            <SelectTrigger
              className={cn(
                size === 'sm'
                  ? 'w-auto min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 h-8 text-xs'
                  : 'w-auto min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8'
              )}
            >
              <SelectValue placeholder={loadingRepos ? 'Loading...' : 'Repo'}>
                {selectedRepo && (
                  <span>{selectedRepo}</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className='relative w-[480px]'>
              {repos && repos.length > 0 && (
                <div className="sticky top-0 z-10 p-3 border-b">
                  <Input
                    ref={filterInputRef}
                    placeholder={
                      (repos?.length || 0) > 50
                        ? `Filter ${repos?.length || 0} repositories...`
                        : 'Filter repositories...'
                    }
                    value={repoFilter}
                    onChange={(e) => setRepoFilter(e.target.value)}
                    disabled={disabled || loadingRepos}
                    className="text-sm rounded-[5px] focus-visible:ring-0 h-8"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              <div className="max-h-80 overflow-y-auto">
                {filteredRepos.length === 0 && repoFilter ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    No repositories match &quot;{repoFilter}&quot;
                  </div>
                ) : (
                  <>
                    {displayedRepos.map((repo) => (
                      <SelectItem key={repo.full_name} value={repo.name} className="p-0">
                        <div className="w-full p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm truncate">{repo.name}</span>
                                {repo.private && (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border">
                                    <Lock className="h-3 w-3" />
                                    <span>Private</span>
                                  </div>
                                )}
                              </div>
                              
                              {repo.description && (
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                  {repo.description}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {repo.language && (
                                  <div className="flex items-center gap-1">
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: getLanguageColor(repo.language) }}
                                    />
                                    <span>{repo.language}</span>
                                  </div>
                                )}
                                
                                {repo.stargazers_count !== undefined && (
                                  <div className="flex items-center gap-1">
                                    <Star className="h-3 w-3" />
                                    <span>{repo.stargazers_count.toLocaleString()}</span>
                                  </div>
                                )}
                                
                                {repo.forks_count !== undefined && (
                                  <div className="flex items-center gap-1">
                                    <GitFork className="h-3 w-3" />
                                    <span>{repo.forks_count.toLocaleString()}</span>
                                  </div>
                                )}
                                
                                {repo.updated_at && (
                                  <span>Updated {formatTimeAgo(repo.updated_at)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                    {hasMoreRepos && (
                      <div className="p-3 text-xs text-muted-foreground text-center border-t bg-muted/20">
                        Showing first 50 of {repos?.length || 0} repositories. Use filter to find more.
                      </div>
                    )}
                  </>
                )}
              </div>
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  )
}
