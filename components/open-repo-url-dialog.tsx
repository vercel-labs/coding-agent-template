'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface OpenRepoUrlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (repoUrl: string) => void
}

export function OpenRepoUrlDialog({ open, onOpenChange, onSubmit }: OpenRepoUrlDialogProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!repoUrl.trim()) {
      toast.error('Please enter a repository URL')
      return
    }

    // Basic validation for GitHub URL format
    const githubUrlPattern = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+/
    if (!githubUrlPattern.test(repoUrl.trim())) {
      toast.error('Invalid GitHub repository URL', {
        description: 'Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)',
      })
      return
    }

    setIsSubmitting(true)
    try {
      onSubmit(repoUrl.trim())
      // Reset form
      setRepoUrl('')
      onOpenChange(false)
    } catch (error) {
      console.error('Error processing repo URL:', error)
      toast.error('Failed to process repository URL')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open Repository URL</DialogTitle>
          <DialogDescription>
            Enter a GitHub repository URL to create a task. The repository will be cloned and you can start working on
            it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="repo-url">Repository URL</Label>
            <Input
              id="repo-url"
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isSubmitting}
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !repoUrl.trim()}>
              {isSubmitting ? 'Opening...' : 'Open Repository'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
