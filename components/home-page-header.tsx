'use client'

import { PageHeader } from '@/components/page-header'
import { RepoSelector } from '@/components/repo-selector'
import { useTasks } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { ConnectorDialog } from '@/components/connectors/manage-connectors'

interface HomePageHeaderProps {
  selectedOwner: string
  selectedRepo: string
  onOwnerChange: (owner: string) => void
  onRepoChange: (repo: string) => void
}

export function HomePageHeader({ selectedOwner, selectedRepo, onOwnerChange, onRepoChange }: HomePageHeaderProps) {
  const { toggleSidebar, refreshTasks } = useTasks()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showConnectorDialog, setShowConnectorDialog] = useState(false)
  const [deleteCompleted, setDeleteCompleted] = useState(true)
  const [deleteFailed, setDeleteFailed] = useState(true)
  const [deleteStopped, setDeleteStopped] = useState(true)

  const handleRefreshRepos = async () => {
    setIsRefreshing(true)
    try {
      // Clear all GitHub-related caches
      sessionStorage.removeItem('github-owners')
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('github-repos-')) {
          sessionStorage.removeItem(key)
        }
      })

      // Reload the page to fetch fresh data
      window.location.reload()
    } catch (error) {
      console.error('Error refreshing repositories:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDeleteTasks = async () => {
    if (!deleteCompleted && !deleteFailed && !deleteStopped) {
      toast.error('Please select at least one task type to delete')
      return
    }

    setIsDeleting(true)
    try {
      const actions = []
      if (deleteCompleted) actions.push('completed')
      if (deleteFailed) actions.push('failed')
      if (deleteStopped) actions.push('stopped')

      const response = await fetch(`/api/tasks?action=${actions.join(',')}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(result.message)
        // Refresh the tasks list to update the sidebar
        await refreshTasks()
        setShowDeleteDialog(false)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete tasks')
      }
    } catch (error) {
      console.error('Error deleting tasks:', error)
      toast.error('Failed to delete tasks')
    } finally {
      setIsDeleting(false)
    }
  }

  const actions = (
    <div className="flex items-center gap-2">
      {/* Deploy to Vercel Button */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
      >
        <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
          Deploy to Vercel
        </a>
      </Button>

      {/* More Actions Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleRefreshRepos} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Repositories
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} disabled={isDeleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Tasks
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const leftActions = (
    <RepoSelector
      selectedOwner={selectedOwner}
      selectedRepo={selectedRepo}
      onOwnerChange={onOwnerChange}
      onRepoChange={onRepoChange}
      size="sm"
    />
  )

  return (
    <>
      <PageHeader
        showMobileMenu={true}
        onToggleMobileMenu={toggleSidebar}
        actions={actions}
        leftActions={leftActions}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tasks</AlertDialogTitle>
            <AlertDialogDescription>
              Select which types of tasks you want to delete. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-completed"
                  checked={deleteCompleted}
                  onCheckedChange={(checked) => setDeleteCompleted(checked === true)}
                />
                <label
                  htmlFor="delete-completed"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Completed Tasks
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-failed"
                  checked={deleteFailed}
                  onCheckedChange={(checked) => setDeleteFailed(checked === true)}
                />
                <label
                  htmlFor="delete-failed"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Failed Tasks
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-stopped"
                  checked={deleteStopped}
                  onCheckedChange={(checked) => setDeleteStopped(checked === true)}
                />
                <label
                  htmlFor="delete-stopped"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Stopped Tasks
                </label>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTasks}
              disabled={isDeleting || (!deleteCompleted && !deleteFailed && !deleteStopped)}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Tasks'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConnectorDialog open={showConnectorDialog} onOpenChange={setShowConnectorDialog} />
    </>
  )
}
