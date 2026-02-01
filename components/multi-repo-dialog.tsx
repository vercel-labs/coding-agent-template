'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Search, Lock, Loader2 } from 'lucide-react'
import { useAtom, useAtomValue } from 'jotai'
import { selectedReposAtom, type SelectedRepo } from '@/lib/atoms/multi-repo'
import { githubOwnersAtom } from '@/lib/atoms/github-cache'

interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
}

interface RepoWithOwner extends GitHubRepo {
  owner: string
}

interface MultiRepoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MultiRepoDialog({ open, onOpenChange }: MultiRepoDialogProps) {
  const [selectedRepos, setSelectedRepos] = useAtom(selectedReposAtom)
  const owners = useAtomValue(githubOwnersAtom)
  const [searchQuery, setSearchQuery] = useState('')
  const [allRepos, setAllRepos] = useState<RepoWithOwner[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load repos from all owners when dialog opens
  useEffect(() => {
    if (open && owners && owners.length > 0 && allRepos.length === 0) {
      const loadAllRepos = async () => {
        setLoadingRepos(true)
        try {
          const repoPromises = owners.map(async (owner) => {
            try {
              const response = await fetch(`/api/github/repos?owner=${owner.login}`)
              if (response.ok) {
                const repos: GitHubRepo[] = await response.json()
                return repos.map((repo) => ({ ...repo, owner: owner.login }))
              }
            } catch (error) {
              console.error('Error loading repos for owner:', error)
            }
            return []
          })

          const results = await Promise.all(repoPromises)
          const combinedRepos = results.flat()
          setAllRepos(combinedRepos)
        } catch (error) {
          console.error('Error loading repos:', error)
        } finally {
          setLoadingRepos(false)
        }
      }
      loadAllRepos()
    }
  }, [open, owners, allRepos.length])

  // Filter repos based on search query and exclude already selected repos
  const filteredRepos = useMemo(() => {
    if (!allRepos.length) return []

    const query = searchQuery.toLowerCase()
    return allRepos.filter(
      (repo) =>
        // Match search query against full_name, name, or description
        (repo.full_name.toLowerCase().includes(query) ||
          repo.name.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query)) &&
        // Exclude already selected repos
        !selectedRepos.some((r) => r.full_name === repo.full_name),
    )
  }, [allRepos, searchQuery, selectedRepos])

  // Handle repo selection
  const handleSelectRepo = (repo: RepoWithOwner) => {
    const newRepo: SelectedRepo = {
      owner: repo.owner,
      repo: repo.name,
      full_name: repo.full_name,
      clone_url: repo.clone_url,
    }

    setSelectedRepos([...selectedRepos, newRepo])
    setSearchQuery('')
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  // Handle repo removal
  const handleRemoveRepo = (fullName: string) => {
    setSelectedRepos(selectedRepos.filter((r) => r.full_name !== fullName))
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Repositories</DialogTitle>
          <DialogDescription>
            Choose multiple repositories to create tasks for. A separate task will be created for each selected
            repository.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selected repos - shown above search so dropdown doesn't cover them */}
          {selectedRepos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Selected ({selectedRepos.length}):</span>
                <button
                  onClick={() => setSelectedRepos([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedRepos.map((repo) => (
                  <Badge key={repo.full_name} variant="secondary" className="gap-1 pr-1">
                    <span>{repo.full_name}</span>
                    <button
                      onClick={() => handleRemoveRepo(repo.full_name)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                      aria-label={`Remove ${repo.full_name}`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search input */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={inputRef}
              placeholder="Search all repositories\u2026"
              aria-label="Search repositories"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              className="pl-9"
            />

            {/* Dropdown */}
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto z-50"
              >
                {loadingRepos ? (
                  <div className="p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading repositories&hellip;</span>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {searchQuery ? `No repositories match "${searchQuery}"` : 'No repositories found'}
                  </div>
                ) : (
                  filteredRepos.slice(0, 50).map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo)}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors hover:bg-accent"
                    >
                      <span className="font-medium">{repo.full_name}</span>
                      {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </button>
                  ))
                )}
                {filteredRepos.length > 50 && (
                  <div className="p-2 text-xs text-muted-foreground text-center border-t">
                    Showing first 50 of {filteredRepos.length} repositories. Use search to find more.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)} disabled={selectedRepos.length === 0}>
            Done ({selectedRepos.length} selected)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
