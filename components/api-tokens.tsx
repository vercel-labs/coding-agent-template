'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Copy, Loader2, Trash2, Plus } from 'lucide-react'

interface Token {
  id: string
  name: string
  tokenPrefix: string
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
}

export function ApiTokens() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchTokens()
  }, [])

  const fetchTokens = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tokens')
      const data = await response.json()
      if (data.tokens) {
        setTokens(data.tokens)
      }
    } catch (error) {
      toast.error('Failed to fetch tokens')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!tokenName.trim()) {
      toast.error('Token name is required')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tokenName }),
      })

      if (response.ok) {
        const data = await response.json()
        setNewToken(data.token)
        setTokenName('')
        fetchTokens()
        toast.success('Token created successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create token')
      }
    } catch (error) {
      toast.error('Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/tokens/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Token deleted')
        setTokens((prev) => prev.filter((t) => t.id !== id))
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete token')
      }
    } catch (error) {
      toast.error('Failed to delete token')
    } finally {
      setDeletingId(null)
    }
  }

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    toast.success('Token copied to clipboard')
  }

  const closeCreateDialog = () => {
    setCreateDialogOpen(false)
    setNewToken(null)
    setTokenName('')
  }

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Tokens</h2>
          <p className="text-sm text-muted-foreground">Manage your personal API tokens for authentication</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Token
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tokens.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No API tokens yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a token to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <Card key={token.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{token.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{token.tokenPrefix}...</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(token.id)}
                    disabled={deletingId === token.id}
                    className="h-8 w-8 p-0"
                  >
                    {deletingId === token.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium">Created:</span> {formatDate(token.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Last used:</span> {formatDate(token.lastUsedAt)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent onPointerDownOutside={(e) => newToken && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{newToken ? 'Token Created' : 'Create API Token'}</DialogTitle>
            <DialogDescription>
              {newToken
                ? 'Copy your token now. You will not be able to see it again.'
                : 'Create a new API token for authenticating requests.'}
            </DialogDescription>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Your new token</Label>
                <div className="flex gap-2">
                  <Input value={newToken} readOnly className="font-mono text-sm" />
                  <Button onClick={() => copyToken(newToken)} size="icon" variant="outline">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button onClick={closeCreateDialog} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token-name">Token name</Label>
                <Input
                  id="token-name"
                  placeholder="My API Token"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating || !tokenName.trim()}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
