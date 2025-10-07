'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock } from 'lucide-react'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoDropdownOpen, repos?.length])

  // Filter repos based on search
  const filteredRepos = (repos || []).filter(
    (repo) =>
      repo.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
      repo.description?.toLowerCase().includes(repoFilter.toLowerCase()),
  )

  // Show first 50 filtered repos, but always include the selected repo if it exists
  let displayedRepos = filteredRepos.slice(0, 50)
  const hasMoreRepos = filteredRepos.length > 50

  // Ensure selected repo is in the displayed list (if it matches current filter)
  if (selectedRepo && repos.length > 0) {
    const isInFilteredRepos = filteredRepos.find((repo) => repo.name === selectedRepo)
    const isInDisplayedRepos = displayedRepos.find((repo) => repo.name === selectedRepo)

    if (isInFilteredRepos && !isInDisplayedRepos) {
      // Selected repo matches filter but is not in the first 50, so add it at the beginning
      displayedRepos = [isInFilteredRepos, ...displayedRepos.slice(0, 49)]
    }
  }

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
              className={
                size === 'sm'
                  ? 'w-auto min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 h-8 text-xs'
                  : 'w-auto min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8'
              }
            >
              <SelectValue placeholder={loadingRepos ? 'Loading...' : 'Repo'} />
            </SelectTrigger>
            <SelectContent>
              {repos && repos.length > 0 && (
                <div className="p-2 border-b">
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
                    className="text-sm h-8"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              {filteredRepos.length === 0 && repoFilter ? (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No repositories match &quot;{repoFilter}&quot;
                </div>
              ) : (
                <>
                  {displayedRepos.map((repo) => (
                    <SelectItem key={repo.full_name} value={repo.name}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{repo.name}</span>
                        {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </SelectItem>
                  ))}
                  {hasMoreRepos && (
                    <div className="p-2 text-xs text-muted-foreground text-center border-t">
                      Showing first 50 of {repos?.length || 0} repositories. Use filter to find more.
                    </div>
                  )}
                </>
              )}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  )
}
