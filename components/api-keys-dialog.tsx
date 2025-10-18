'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'

interface ApiKeysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

const PROVIDERS = [
  { id: 'aigateway' as Provider, name: 'AI Gateway', placeholder: 'gw_...' },
  { id: 'anthropic' as Provider, name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai' as Provider, name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'gemini' as Provider, name: 'Gemini', placeholder: 'AIza...' },
  { id: 'cursor' as Provider, name: 'Cursor', placeholder: 'cur_...' },
]

export function ApiKeysDialog({ open, onOpenChange }: ApiKeysDialogProps) {
  const [apiKeys, setApiKeys] = useState<Record<Provider, string>>({
    openai: '',
    gemini: '',
    cursor: '',
    anthropic: '',
    aigateway: '',
  })
  const [savedKeys, setSavedKeys] = useState<Set<Provider>>(new Set())
  const [clearedKeys, setClearedKeys] = useState<Set<Provider>>(new Set())
  const [showKeys, setShowKeys] = useState<Record<Provider, boolean>>({
    openai: false,
    gemini: false,
    cursor: false,
    anthropic: false,
    aigateway: false,
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      fetchApiKeys()
    }
  }, [open])

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/api-keys')
      const data = await response.json()

      if (data.success) {
        const saved = new Set<Provider>()
        data.apiKeys.forEach((key: { provider: Provider }) => {
          saved.add(key.provider)
        })
        setSavedKeys(saved)
      }
    } catch (error) {
      console.error('Error fetching API keys:', error)
    }
  }

  const handleSave = async (provider: Provider) => {
    const key = apiKeys[provider]
    if (!key.trim()) {
      toast.error('Please enter an API key')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          apiKey: key,
        }),
      })

      if (response.ok) {
        toast.success(`${PROVIDERS.find((p) => p.id === provider)?.name} API key saved`)
        setSavedKeys((prev) => new Set(prev).add(provider))
        setClearedKeys((prev) => {
          const newSet = new Set(prev)
          newSet.delete(provider)
          return newSet
        })
        setApiKeys((prev) => ({ ...prev, [provider]: '' }))
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save API key')
      }
    } catch (error) {
      console.error('Error saving API key:', error)
      toast.error('Failed to save API key')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (provider: Provider) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/api-keys?provider=${provider}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success(`${PROVIDERS.find((p) => p.id === provider)?.name} API key deleted`)
        setSavedKeys((prev) => {
          const newSet = new Set(prev)
          newSet.delete(provider)
          return newSet
        })
        setClearedKeys((prev) => {
          const newSet = new Set(prev)
          newSet.delete(provider)
          return newSet
        })
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete API key')
      }
    } catch (error) {
      console.error('Error deleting API key:', error)
      toast.error('Failed to delete API key')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = (provider: Provider) => {
    // Mark as cleared locally, no DB changes
    setClearedKeys((prev) => new Set(prev).add(provider))
    setApiKeys((prev) => ({ ...prev, [provider]: '' }))
  }

  const toggleShowKey = (provider: Provider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
          <DialogDescription>
            Configure your own API keys. System defaults will be used if not provided.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {PROVIDERS.map((provider) => {
            const hasSavedKey = savedKeys.has(provider.id)
            const isCleared = clearedKeys.has(provider.id)
            const showSaveButton = !hasSavedKey || isCleared
            const isInputDisabled = hasSavedKey && !isCleared

            return (
              <div key={provider.id} className="flex items-center gap-2">
                <Label htmlFor={provider.id} className="text-sm w-24 shrink-0">
                  {provider.name}
                </Label>
                <div className="relative flex-1">
                  <Input
                    id={provider.id}
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    placeholder={hasSavedKey && !isCleared ? '••••••••••••••••' : provider.placeholder}
                    value={apiKeys[provider.id]}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                    disabled={loading || isInputDisabled}
                    className="pr-9 h-8 text-sm"
                  />
                  <button
                    onClick={() => toggleShowKey(provider.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                    disabled={loading || isInputDisabled}
                  >
                    {showKeys[provider.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {showSaveButton ? (
                  <Button
                    size="sm"
                    onClick={() => handleSave(provider.id)}
                    disabled={loading || !apiKeys[provider.id].trim()}
                    className="h-8 px-3 text-xs w-16"
                  >
                    Save
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleClear(provider.id)}
                    disabled={loading}
                    className="h-8 px-3 text-xs w-16"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
