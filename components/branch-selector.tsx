'use client'

import { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { useAtomValue } from 'jotai'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, GitBranch, Shield } from 'lucide-react'
import { githubBranchesAtomFamily } from '@/lib/atoms/github-cache'
import { githubConnectionAtom } from '@/lib/atoms/github-connection'
import { cn } from '@/lib/utils'

/** Props for the BranchSelector component */
interface BranchSelectorProps {
  /** Repository owner (GitHub username or organization) */
  selectedOwner: string
  /** Repository name */
  selectedRepo: string
  /** Currently selected branch name */
  selectedBranch: string
  /** Callback fired when user selects a different branch */
  onBranchChange: (branch: string) => void
  /** Whether the selector is disabled */
  disabled?: boolean
  /** Size variant for the trigger button */
  size?: 'sm' | 'default'
}

/**
 * BranchSelector component
 *
 * Dropdown selector for GitHub repository branches with auto-load from API.
 * Fetches all branches with caching, displays default branch first with indicator,
 * and shows protection status with shield icon. Auto-selects default branch if none
 * is currently selected.
 */
export function BranchSelector({
  selectedOwner,
  selectedRepo,
  selectedBranch,
  onBranchChange,
  disabled = false,
  size = 'default',
}: BranchSelectorProps) {
  const repoFullName = `${selectedOwner}/${selectedRepo}`
  const [branchData, setBranchData] = useAtom(githubBranchesAtomFamily(repoFullName))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const githubConnection = useAtomValue(githubConnectionAtom)

  // Fetch branches when owner/repo changes
  useEffect(() => {
    if (!selectedOwner || !selectedRepo || !githubConnection.connected) {
      return
    }

    const fetchBranches = async () => {
      // Check if we have cached data
      if (branchData) {
        setLoading(false)
        // Auto-select default branch from cache if no branch selected
        if (!selectedBranch && branchData.defaultBranch) {
          onBranchChange(branchData.defaultBranch)
        }
        return
      }

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/github/branches?owner=${selectedOwner}&repo=${selectedRepo}`)

        if (!response.ok) {
          throw new Error('Failed to fetch branches')
        }

        const data = await response.json()
        setBranchData(data)

        // Auto-select default branch from fresh API response if no branch selected
        if (!selectedBranch && data.defaultBranch) {
          onBranchChange(data.defaultBranch)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch branches')
      } finally {
        setLoading(false)
      }
    }

    fetchBranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOwner, selectedRepo, githubConnection.connected])

  // Don't render if no repo selected
  if (!selectedOwner || !selectedRepo) {
    return null
  }

  const triggerClassName =
    size === 'sm'
      ? 'w-auto min-w-[80px] max-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8 text-xs'
      : 'w-auto min-w-[160px] border-0 bg-transparent shadow-none focus:ring-0 h-8'

  return (
    <Select value={selectedBranch} onValueChange={onBranchChange} disabled={disabled || loading}>
      <SelectTrigger className={cn(triggerClassName, 'focus-visible:ring-1')}>
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline text-xs">Loading&hellip;</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive">
            <GitBranch className="h-3 w-3" />
            <span className="hidden sm:inline text-xs">Error</span>
          </div>
        ) : (
          <SelectValue placeholder="Branch" />
        )}
      </SelectTrigger>
      <SelectContent>
        {error ? (
          <div className="p-2 text-xs text-destructive text-center">{error}</div>
        ) : branchData && branchData.branches.length > 0 ? (
          branchData.branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name}>
              <div className="flex items-center gap-2">
                <GitBranch className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{branch.name}</span>
                {branch.name === branchData.defaultBranch && (
                  <span className="text-xs text-muted-foreground">(default)</span>
                )}
                {branch.protected && <Shield className="h-3 w-3 text-amber-600" />}
              </div>
            </SelectItem>
          ))
        ) : (
          <div className="p-2 text-xs text-muted-foreground text-center">No branches found</div>
        )}
      </SelectContent>
    </Select>
  )
}
