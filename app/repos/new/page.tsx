'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'

export default function NewRepoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const owner = searchParams.get('owner') || ''

  const [isCreatingRepo, setIsCreatingRepo] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoDescription, setNewRepoDescription] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(true)

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) {
      toast.error('Repository name is required')
      return
    }

    setIsCreatingRepo(true)
    try {
      const response = await fetch('/api/github/repos/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: newRepoDescription.trim(),
          private: newRepoPrivate,
          owner: owner,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Repository created successfully')

        // Clear repos cache for current owner
        if (owner) {
          localStorage.removeItem(`github-repos-${owner}`)
        }

        // Redirect to home page and reload to refresh repos list
        router.push('/')
        window.location.reload()
      } else {
        toast.error(data.error || 'Failed to create repository')
      }
    } catch (error) {
      console.error('Error creating repository:', error)
      toast.error('Failed to create repository')
    } finally {
      setIsCreatingRepo(false)
    }
  }

  const handleCancel = () => {
    router.back()
  }

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={handleCancel} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Create New Repository</h1>
        <p className="text-muted-foreground mt-2">Create a new GitHub repository{owner ? ` for ${owner}` : ''}.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="repo-name">Repository Name *</Label>
          <Input
            id="repo-name"
            placeholder="my-awesome-project"
            value={newRepoName}
            onChange={(e) => setNewRepoName(e.target.value)}
            disabled={isCreatingRepo}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCreateRepo()
              }
            }}
          />
          <p className="text-xs text-muted-foreground">Use lowercase letters, numbers, hyphens, and underscores.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="repo-description">Description (optional)</Label>
          <Textarea
            id="repo-description"
            placeholder="A brief description of your project"
            value={newRepoDescription}
            onChange={(e) => setNewRepoDescription(e.target.value)}
            disabled={isCreatingRepo}
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="repo-private" className="text-sm font-medium">
              Private repository
            </Label>
            <p className="text-xs text-muted-foreground">Choose who can see this repository</p>
          </div>
          <Switch
            id="repo-private"
            checked={newRepoPrivate}
            onCheckedChange={setNewRepoPrivate}
            disabled={isCreatingRepo}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleCancel} disabled={isCreatingRepo}>
            Cancel
          </Button>
          <Button onClick={handleCreateRepo} disabled={isCreatingRepo || !newRepoName.trim()}>
            {isCreatingRepo ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Repository'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
