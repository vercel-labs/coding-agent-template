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
import { Loader2 } from 'lucide-react'

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
  prUrl,
  prNumber,
  open,
  onOpenChange,
  onPRMerged,
  onMergeInitiated,
}: MergePRDialogProps) {
  const [mergeMethod, setMergeMethod] = useState<'squash' | 'merge' | 'rebase'>('squash')
  const [isMerging, setIsMerging] = useState(false)

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
        toast.error(result.error || 'Failed to merge pull request')
      }
    } catch (error) {
      console.error('Error merging PR:', error)
      toast.error('Failed to merge pull request')
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Select value={mergeMethod} onValueChange={(value: any) => setMergeMethod(value)} disabled={isMerging}>
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
  )
}
