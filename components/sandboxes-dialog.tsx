'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ExternalLink, StopCircle, Loader2, Server } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface SandboxesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Sandbox {
  id: string
  taskId: string
  prompt: string
  repoUrl: string
  branchName: string
  sandboxId: string
  sandboxUrl: string | null
  createdAt: Date
  status: string
  keepAlive: boolean
  maxDuration: number | null
}

export function SandboxesDialog({ open, onOpenChange }: SandboxesDialogProps) {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([])
  const [loading, setLoading] = useState(false)
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) {
      fetchSandboxes()
    }
  }, [open])

  const fetchSandboxes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sandboxes')
      const data = await response.json()

      if (data.sandboxes) {
        setSandboxes(data.sandboxes)
      }
    } catch (error) {
      console.error('Error fetching sandboxes:', error)
      toast.error('Failed to fetch sandboxes')
    } finally {
      setLoading(false)
    }
  }

  const handleStopSandbox = async (taskId: string) => {
    setStoppingId(taskId)
    try {
      const response = await fetch(`/api/tasks/${taskId}/stop-sandbox`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Sandbox stopped successfully!')
        // Remove from list
        setSandboxes((prev) => prev.filter((s) => s.taskId !== taskId))
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to stop sandbox')
      }
    } catch (error) {
      console.error('Error stopping sandbox:', error)
      toast.error('Failed to stop sandbox')
    } finally {
      setStoppingId(null)
    }
  }

  const handleViewTask = (taskId: string) => {
    onOpenChange(false)
    router.push(`/tasks/${taskId}`)
  }

  const calculateTimeRemaining = (createdAt: Date, maxDuration: number | null) => {
    // Use the sandbox's actual maxDuration in minutes (defaults to 300 minutes = 5 hours if not set)
    const maxDurationMinutes = maxDuration || 300
    const createdTime = new Date(createdAt).getTime()
    const now = Date.now()
    const maxDurationMs = maxDurationMinutes * 60 * 1000 // Convert minutes to milliseconds
    const elapsed = now - createdTime
    const remaining = maxDurationMs - elapsed

    if (remaining <= 0) return 'Expired'

    const hours = Math.floor(remaining / (60 * 60 * 1000))
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Running Sandboxes</DialogTitle>
          <DialogDescription>Manage your active sandbox environments</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sandboxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Server className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No running sandboxes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sandboxes.map((sandbox) => (
                <div
                  key={sandbox.taskId}
                  className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{sandbox.prompt}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sandbox.branchName && <span className="font-mono">{sandbox.branchName}</span>}
                        </p>
                      </div>
                      {sandbox.keepAlive && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {calculateTimeRemaining(sandbox.createdAt, sandbox.maxDuration)} remaining
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewTask(sandbox.taskId)}
                        className="h-7 text-xs"
                      >
                        View Task
                      </Button>
                      {sandbox.sandboxUrl && (
                        <Link href={sandbox.sandboxUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStopSandbox(sandbox.taskId)}
                        disabled={stoppingId === sandbox.taskId}
                        className="h-7 text-xs ml-auto"
                      >
                        {stoppingId === sandbox.taskId ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <StopCircle className="h-3 w-3 mr-1" />
                        )}
                        Stop
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
