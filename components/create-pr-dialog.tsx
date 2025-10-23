'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface CreatePRDialogProps {
  taskId: string
  defaultTitle?: string
  defaultBody?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPRCreated?: (prUrl: string, prNumber: number) => void
}

export function CreatePRDialog({
  taskId,
  defaultTitle = '',
  defaultBody = '',
  open,
  onOpenChange,
  onPRCreated,
}: CreatePRDialogProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [body, setBody] = useState(defaultBody)
  const [isCreating, setIsCreating] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check if the device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Please enter a PR title')
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}/pr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          baseBranch: 'main',
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        if (result.data.alreadyExists) {
          toast.info('Pull request already exists')
        } else {
          toast.success('Pull request created successfully!')
          if (onPRCreated && result.data.prUrl && result.data.prNumber) {
            onPRCreated(result.data.prUrl, result.data.prNumber)
          }
        }
        onOpenChange(false)
      } else {
        toast.error(result.error || 'Failed to create pull request')
      }
    } catch (error) {
      console.error('Error creating PR:', error)
      toast.error('Failed to create pull request')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Create Pull Request</DialogTitle>
          <DialogDescription>
            Create a pull request for the changes made in this task. The PR will be created on GitHub and opened in a
            new tab.
          </DialogDescription>
        </DialogHeader>
        <form id="create-pr-form" onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Brief description of the changes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isCreating}
                autoFocus={!isMobile}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="body">Description</Label>
              <Textarea
                id="body"
                placeholder="Detailed description of the changes (optional)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isCreating}
                className="min-h-[120px] max-h-[300px] resize-none"
              />
            </div>
          </div>
        </form>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="submit" form="create-pr-form" disabled={isCreating || !title.trim()}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreating ? 'Creating...' : 'Create Pull Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
