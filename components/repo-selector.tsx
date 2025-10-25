'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock, Loader2 } from 'lucide-react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { githubConnectionAtom } from '@/lib/atoms/github-connection'
import { githubOwnersAtom, githubReposAtomFamily } from '@/lib/atoms/github-cache'

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
  const [owners, setOwners] = useAtom(githubOwnersAtom)
  const [repos, setRepos] = useAtom(githubReposAtomFamily(selectedOwner))
  const [loadingOwners, setLoadingOwners] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Ref for the filter input to focus it when dropdown opens
  const filterInputRef = useRef<HTMLInputElement>(null)

  // Watch for GitHub connection changes
  const githubConnection = useAtomValue(githubConnectionAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const githubConnectionRef = useRef(githubConnection.connected)

  // React to GitHub connection changes
  useEffect(() => {
    // If GitHub was disconnected, clear data and cache
    if (githubConnectionRef.current && !githubConnection.connected) {
      // Clear cache using atoms
      setOwners(null)
      // Clear all repos - we need to iterate through all possible owners
      // Since we can't clear all atomFamily members easily, we'll just clear the current one
      setRepos(null)

      // Clear state
      onOwnerChange('')
      onRepoChange('')
    }

    // If GitHub was reconnected, reload owners
    if (!githubConnectionRef.current && githubConnection.connected) {
      setLoadingOwners(true)
      setOwners(null)
      setRepos(null)
    }

    githubConnectionRef.current = githubConnection.connected
  }, [githubConnection.connected, onOwnerChange, onRepoChange, setOwners, setRepos])

  // Load owners on component mount and when GitHub is connected
  useEffect(() => {
    if (!githubConnection.connected) {
      setLoadingOwners(false)
      return
    }

    const loadOwners = async () => {
      try {
        // Only show loading state if we don't have owners yet
        if (!owners || owners.length === 0) {
          setLoadingOwners(true)
        } else {
          setIsRefreshing(true)
        }

        // Check cache first - but only use it if we're not forcing a refresh
        if (owners && owners.length > 0) {
          setLoadingOwners(false)
          // Continue fetching in background to update
        }

        // Fetch both user and organizations
        const [userResponse, orgsResponse] = await Promise.all([fetch('/api/github/user'), fetch('/api/github/orgs')])

        // Check for authentication errors - disconnect GitHub if auth fails
        if (!userResponse.ok) {
          if (userResponse.status === 401 || userResponse.status === 403) {
            // Clear cache using atoms
            setOwners(null)

            // Call backend to disconnect GitHub
            try {
              await fetch('/api/auth/github/disconnect', {
                method: 'POST',
                credentials: 'include',
              })
            } catch (error) {
              console.error('Error disconnecting GitHub:', error)
            }

            // Update connection state to trigger "Connect GitHub" button
            setGitHubConnection({ connected: false })
            setLoadingOwners(false)
            setIsRefreshing(false)
            return
          }
          throw new Error('Failed to load GitHub user')
        }

        let personalAccount: GitHubOwner | null = null

        // Get user (personal account)
        const user = await userResponse.json()
        personalAccount = {
          login: user.login,
          name: user.name || user.login,
          avatar_url: user.avatar_url,
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
        // Cache is automatic with atomWithStorage
      } catch (error) {
        console.error('Error loading owners:', error)

        // Call backend to disconnect GitHub
        try {
          await fetch('/api/auth/github/disconnect', {
            method: 'POST',
            credentials: 'include',
          })
        } catch (disconnectError) {
          console.error('Error disconnecting GitHub:', disconnectError)
        }

        // On any error, clear the connection
        setGitHubConnection({ connected: false })
      } finally {
        setLoadingOwners(false)
        setIsRefreshing(false)
      }
    }

    loadOwners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubConnection.connected, setGitHubConnection, setOwners])

  // Auto-select user's personal account if no owner is selected and no saved owner exists
  useEffect(() => {
    if (owners && owners.length > 0 && !selectedOwner) {
      // Only auto-select if we have owners loaded and no owner is currently selected
      // This allows the parent component to set a saved owner from cookies first
      const timer = setTimeout(() => {
        if (!selectedOwner && owners && owners.length > 0) {
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
        try {
          // Check cache first - show cached data immediately if available
          if (repos && repos.length > 0) {
            setLoadingRepos(false)
            // Continue fetching in background to update
          } else {
            // Only show loading if we don't have cached data or existing repos
            setLoadingRepos(true)
          }

          const response = await fetch(`/api/github/repos?owner=${selectedOwner}`)

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              // Clear cache using atoms
              setOwners(null)

              // Call backend to disconnect GitHub
              try {
                await fetch('/api/auth/github/disconnect', {
                  method: 'POST',
                  credentials: 'include',
                })
              } catch (error) {
                console.error('Error disconnecting GitHub:', error)
              }

              // Update connection state to trigger "Connect GitHub" button
              setGitHubConnection({ connected: false })
              setLoadingRepos(false)
              setIsRefreshing(false)
              return
            }
            throw new Error('Failed to load repositories')
          }

          const reposList = await response.json()
          setRepos(reposList)
          // Cache is automatic with atomWithStorage
        } catch (error) {
          console.error('Error loading repos:', error)

          // Call backend to disconnect GitHub
          try {
            await fetch('/api/auth/github/disconnect', {
              method: 'POST',
              credentials: 'include',
            })
          } catch (disconnectError) {
            console.error('Error disconnecting GitHub:', disconnectError)
          }

          // On any error, clear the connection
          setGitHubConnection({ connected: false })
        } finally {
          setLoadingRepos(false)
          setIsRefreshing(false)
        }
      }

      loadRepos()
    } else {
      setRepos(null)
      setLoadingRepos(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOwner, setGitHubConnection, setOwners, setRepos])

  // Focus filter input when dropdown opens (but not on mobile to prevent keyboard popup)
  useEffect(() => {
    if (repoDropdownOpen && filterInputRef.current && repos && repos.length > 0) {
      // Check if we're on a mobile device
      const isMobile = window.matchMedia('(max-width: 768px)').matches

      // Only autofocus on non-mobile devices
      if (!isMobile) {
        // Small delay to ensure the dropdown is fully rendered
        setTimeout(() => {
          if (filterInputRef.current) {
            filterInputRef.current.focus()
          }
        }, 100)
      }
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
  if (selectedRepo && repos && repos.length > 0) {
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
    setRepos(null) // Clear repos to trigger loading state for new owner
  }

  const handleRepoChange = (value: string) => {
    onRepoChange(value)
  }

  const ownerTriggerClassName =
    size === 'sm'
      ? 'w-auto min-w-[32px] sm:min-w-[100px] border-0 bg-transparent shadow-none focus:ring-0 h-8 text-xs pl-2 pr-1 sm:px-3'
      : 'w-auto min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8'

  const repoTriggerClassName =
    size === 'sm'
      ? 'w-auto min-w-[80px] sm:min-w-[120px] max-w-[240px] sm:max-w-none border-0 bg-transparent shadow-none focus:ring-0 h-8 text-xs'
      : 'w-auto min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8'

  // Find the selected owner for avatar display
  const selectedOwnerData = owners?.find((owner) => owner.login === selectedOwner)

  // Determine if we should show loading indicators
  const showOwnersLoading = loadingOwners && (!owners || owners.length === 0)
  const showReposLoading = loadingRepos && (!repos || repos.length === 0)

  return (
    <div className="flex items-center gap-1 sm:gap-2 h-8">
      <Select value={selectedOwner} onValueChange={handleOwnerChange} disabled={disabled || showOwnersLoading}>
        <SelectTrigger className={ownerTriggerClassName}>
          {showOwnersLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : size === 'sm' && selectedOwnerData ? (
            // Mobile: Show only avatar
            <div className="flex items-center gap-1">
              <Image
                src={selectedOwnerData.avatar_url}
                alt={selectedOwnerData.login}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full sm:hidden"
              />
              <span className="hidden sm:inline">
                <SelectValue placeholder="Owner" />
              </span>
            </div>
          ) : (
            <SelectValue placeholder="Owner" />
          )}
        </SelectTrigger>
        <SelectContent>
          {owners &&
            owners.map((owner) => (
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
          <span className="text-muted-foreground text-xs">/</span>

          <Select
            value={selectedRepo}
            onValueChange={handleRepoChange}
            disabled={disabled || showReposLoading}
            onOpenChange={setRepoDropdownOpen}
          >
            <SelectTrigger className={repoTriggerClassName}>
              {showReposLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <SelectValue placeholder="Repo" />
              )}
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
                    disabled={disabled}
                    className="text-base md:text-sm h-8"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              {filteredRepos.length === 0 && repoFilter ? (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No repositories match &quot;{repoFilter}&quot;
                </div>
              ) : showReposLoading ? (
                <div className="p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading repositories...</span>
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
