'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'

interface MergePRDialogProps {
  taskId: string
  prUrl: string
  prNumber: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPRMerged?: () => void
  onMergeInitiated?: () => void
}

export function MergePRDialog({
  taskId,
  prUrl: _prUrl,
  prNumber,
  open,
  onOpenChange,
  onPRMerged,
  onMergeInitiated,
}: MergePRDialogProps) {
  const [mergeMethod, setMergeMethod] = useState<'squash' | 'merge' | 'rebase'>('squash')
  const [isMerging, setIsMerging] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [isCreatingFixTask, setIsCreatingFixTask] = useState(false)

  const handleMergePR = async () => {
    setIsMerging(true)

    // Notify parent that merge is initiated (for loading state)
    if (onMergeInitiated) {
      onMergeInitiated()
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}/merge-pr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mergeMethod,
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        // Don't show toast here - parent will show it when status updates
        if (onPRMerged) {
          onPRMerged()
        }
        onOpenChange(false)
      } else {
        // Check if this is a merge conflict error
        if (result.error && result.error.includes('conflict')) {
          // Show the conflict resolution dialog
          setShowConflictDialog(true)
        } else {
          toast.error(result.error || 'Failed to merge pull request')
        }
      }
    } catch (error) {
      console.error('Error merging PR:', error)
      toast.error('Failed to merge pull request')
    } finally {
      setIsMerging(false)
    }
  }

  const handleAgentFixConflict = async () => {
    setIsCreatingFixTask(true)

    try {
      // Get task data from the fix-merge-conflict endpoint
      const taskDataResponse = await fetch(`/api/tasks/${taskId}/fix-merge-conflict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const taskDataResult = await taskDataResponse.json()

      if (!taskDataResponse.ok || !taskDataResult.success) {
        toast.error(taskDataResult.error || 'Failed to get task data')
        return
      }

      const taskData = taskDataResult.taskData

      // Create a new task to fix the merge conflict
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt:
            'Fix merge conflicts in the current branch and prepare it for merging. Review the conflicting changes carefully and resolve them intelligently, preserving the intent of both sets of changes where possible.',
          repoUrl: taskData.repoUrl,
          branchName: taskData.branchName, // Continue on the same branch
          selectedAgent: taskData.selectedAgent,
          selectedModel: taskData.selectedModel,
          installDependencies: false,
          keepAlive: taskData.keepAlive,
          maxDuration: taskData.maxDuration,
        }),
      })

      const result = await response.json()

      if (response.ok && result.task) {
        toast.success('Agent task created to fix merge conflict')
        setShowConflictDialog(false)
        onOpenChange(false)

        // Redirect to the new task
        window.location.href = `/tasks/${result.task.id}`
      } else {
        toast.error(result.error || 'Failed to create agent task')
      }
    } catch (error) {
      console.error('Error creating agent task:', error)
      toast.error('Failed to create agent task')
    } finally {
      setIsCreatingFixTask(false)
    }
  }

  const handleCancelConflictDialog = () => {
    setShowConflictDialog(false)
    onOpenChange(false)
  }

  return (
    <>
      {/* Main Merge Dialog */}
      <Dialog open={open && !showConflictDialog} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Merge Pull Request</DialogTitle>
            <DialogDescription>
              This will merge PR #{prNumber} into the main branch. Choose your preferred merge method.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mergeMethod">Merge Method</Label>
              <Select
                value={mergeMethod}
                onValueChange={(value: 'squash' | 'merge' | 'rebase') => setMergeMethod(value)}
                disabled={isMerging}
              >
                <SelectTrigger id="mergeMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="squash">Squash and merge</SelectItem>
                  <SelectItem value="merge">Create a merge commit</SelectItem>
                  <SelectItem value="rebase">Rebase and merge</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
              Cancel
            </Button>
            <Button onClick={handleMergePR} disabled={isMerging}>
              {isMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isMerging ? 'Merging...' : 'Merge Pull Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Conflict Resolution Dialog */}
      <Dialog
        open={open && showConflictDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowConflictDialog(false)
          }
          onOpenChange(isOpen)
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Merge Conflict Detected
            </DialogTitle>
            <DialogDescription>
              This pull request has merge conflicts that prevent automatic merging. Would you like an AI agent to
              resolve the conflicts for you?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">The agent will:</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
              <li>Analyze the conflicting changes</li>
              <li>Intelligently merge the code</li>
              <li>Create a new commit with the resolved conflicts</li>
              <li>Push the changes to your branch</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelConflictDialog} disabled={isCreatingFixTask}>
              Cancel
            </Button>
            <Button onClick={handleAgentFixConflict} disabled={isCreatingFixTask}>
              {isCreatingFixTask && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCreatingFixTask ? 'Creating Task...' : 'Fix with Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
