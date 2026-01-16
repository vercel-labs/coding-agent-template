'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Eye, EyeOff, Plus, Trash2, Copy, Loader2, AlertTriangle, Check } from 'lucide-react'

interface ApiKeysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

interface Token {
  id: string
  name: string
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

const PROVIDERS = [
  { id: 'aigateway' as Provider, name: 'AI Gateway', placeholder: 'gw_...' },
  { id: 'anthropic' as Provider, name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai' as Provider, name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'gemini' as Provider, name: 'Gemini', placeholder: 'AIza...' },
  { id: 'cursor' as Provider, name: 'Cursor', placeholder: 'cur_...' },
]

export function ApiKeysDialog({ open, onOpenChange }: ApiKeysDialogProps) {
  // API Keys state
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

  // API Tokens state
  const [tokens, setTokens] = useState<Token[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      fetchApiKeys()
      fetchTokens()
    }
  }, [open])

  // Clear newToken after 60 seconds for security
  useEffect(() => {
    if (newToken) {
      const timer = setTimeout(() => {
        setNewToken(null)
      }, 60000)
      return () => clearTimeout(timer)
    }
  }, [newToken])

  // Focus copy button when new token appears
  useEffect(() => {
    if (newToken && copyButtonRef.current) {
      copyButtonRef.current.focus()
    }
  }, [newToken])

  // API Keys functions
  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/api-keys')
      const data = await response.json()

      if (data.success) {
        const saved = new Set<Provider>()
        const keyValues: Record<Provider, string> = {
          openai: '',
          gemini: '',
          cursor: '',
          anthropic: '',
          aigateway: '',
        }
        data.apiKeys.forEach((key: { provider: Provider; value: string }) => {
          saved.add(key.provider)
          keyValues[key.provider] = key.value
        })
        setSavedKeys(saved)
        setApiKeys(keyValues)
      }
    } catch {
      // Silently fail
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      })

      if (response.ok) {
        toast.success(`${PROVIDERS.find((p) => p.id === provider)?.name} API key saved`)
        setSavedKeys((prev) => new Set(prev).add(provider))
        setClearedKeys((prev) => {
          const newSet = new Set(prev)
          newSet.delete(provider)
          return newSet
        })
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save API key')
      }
    } catch {
      toast.error('Failed to save API key')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = (provider: Provider) => {
    setClearedKeys((prev) => new Set(prev).add(provider))
    setApiKeys((prev) => ({ ...prev, [provider]: '' }))
  }

  const toggleShowKey = (provider: Provider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  // API Tokens functions
  const fetchTokens = async () => {
    setTokensLoading(true)
    try {
      const response = await fetch('/api/tokens')
      const data = await response.json()
      if (data.tokens) {
        setTokens(data.tokens)
      }
    } catch {
      // Silently fail
    } finally {
      setTokensLoading(false)
    }
  }

  const handleCreateToken = async () => {
    if (!tokenName.trim()) {
      toast.error('Token name is required')
      return
    }
    if (creating) return

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
        toast.success('Token created')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create token')
      }
    } catch {
      toast.error('Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteToken = async (id: string) => {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/tokens/${id}`, { method: 'DELETE' })
      if (response.ok) {
        toast.success('Token deleted')
        setTokens((prev) => prev.filter((t) => t.id !== id))
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete token')
      }
    } catch {
      toast.error('Failed to delete token')
    } finally {
      setDeletingId(null)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const curlExample = `curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/api/tasks \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"instruction": "Fix the bug", "repoUrl": "https://github.com/owner/repo", "selectedAgent": "claude"}'`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Configure your own API keys. System defaults will be used if not provided.
          </DialogDescription>
        </DialogHeader>

        {/* AI Provider Keys Section */}
        <div className="space-y-2">
          {PROVIDERS.map((provider) => {
            const hasSavedKey = savedKeys.has(provider.id)
            const isCleared = clearedKeys.has(provider.id)
            const showSaveButton = !hasSavedKey || isCleared
            const isInputDisabled = hasSavedKey && !isCleared

            return (
              <div key={provider.id} className="flex items-center gap-2">
                <Label htmlFor={provider.id} className="text-xs sm:text-sm w-20 sm:w-24 shrink-0">
                  {provider.name}
                </Label>
                <div className="relative flex-1">
                  <Input
                    id={provider.id}
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    placeholder={!hasSavedKey || isCleared ? provider.placeholder : ''}
                    value={
                      hasSavedKey && !isCleared
                        ? showKeys[provider.id]
                          ? apiKeys[provider.id]
                          : '••••••••••••••••'
                        : apiKeys[provider.id]
                    }
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                    disabled={loading || isInputDisabled}
                    className="pr-9 h-8 text-sm"
                  />
                  {((hasSavedKey && !isCleared) || apiKeys[provider.id]) && (
                    <button
                      onClick={() => toggleShowKey(provider.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      type="button"
                      disabled={loading}
                    >
                      {showKeys[provider.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                {showSaveButton ? (
                  <Button
                    size="sm"
                    onClick={() => handleSave(provider.id)}
                    disabled={loading || !apiKeys[provider.id].trim()}
                    className="h-8 px-2 sm:px-3 text-xs w-14 sm:w-16"
                  >
                    Save
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleClear(provider.id)}
                    disabled={loading}
                    className="h-8 px-2 sm:px-3 text-xs w-14 sm:w-16"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-t my-4" />

        {/* External API Tokens Section */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">External API Access</h3>
              <p className="text-xs text-muted-foreground">Call the coding agent from external apps</p>
            </div>
          </div>

          {/* New Token Created View */}
          {newToken ? (
            <div className="space-y-3 p-3 rounded-lg border border-amber-500/50 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Copy this token now. You won&apos;t see it again!
                </p>
              </div>
              <div className="flex gap-2">
                <Input value={newToken} readOnly className="font-mono text-xs h-8" />
                <Button
                  ref={copyButtonRef}
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(newToken)}
                  className="h-8 px-2 shrink-0"
                  aria-label="Copy token"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setNewToken(null)} className="w-full h-7 text-xs">
                Done
              </Button>
            </div>
          ) : (
            /* Create Token Form */
            <div className="flex gap-2">
              <Input
                placeholder="Token name (e.g., My Script)"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateToken()}
                className="h-8 text-sm"
                maxLength={50}
              />
              <Button
                size="sm"
                onClick={handleCreateToken}
                disabled={creating || !tokenName.trim()}
                className="h-8 px-3 shrink-0"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                {creating ? '' : 'Create'}
              </Button>
            </div>
          )}

          {/* Existing Tokens List */}
          {tokensLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length > 0 ? (
            <div className="space-y-1">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 gap-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 min-w-0 flex-1">
                    <span className="text-sm truncate">{token.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{token.tokenPrefix}...</span>
                      <span className="hidden sm:inline">•</span>
                      <span>Used: {formatDate(token.lastUsedAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteToken(token.id)}
                    disabled={deletingId === token.id}
                    className="h-6 w-6 p-0 shrink-0"
                    aria-label={`Delete ${token.name}`}
                  >
                    {deletingId === token.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Usage Example */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Usage Example</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(curlExample)}
                className="h-6 px-2 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className="rounded-md bg-muted/50 p-2 sm:p-2.5 overflow-hidden">
              <div className="overflow-x-auto">
                <pre className="text-[10px] sm:text-[11px] leading-relaxed text-muted-foreground whitespace-pre w-max">
                  <code>{curlExample}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
