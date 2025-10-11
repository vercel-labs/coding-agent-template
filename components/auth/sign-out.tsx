'use client'

import type { Session } from '@/lib/session/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { redirectToSignOut } from '@/lib/session/redirect-to-sign-out'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useSetAtom, useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { githubConnectionAtom } from '@/lib/atoms/github-connection'
import { GitHubIcon } from '@/components/icons/github-icon'
import { ApiKeysDialog } from '@/components/api-keys-dialog'
import { Key } from 'lucide-react'
import { useState, useEffect } from 'react'

interface RateLimitInfo {
  used: number
  total: number
  remaining: number
}

export function SignOut({ user }: Pick<Session, 'user'>) {
  const router = useRouter()
  const setSession = useSetAtom(sessionAtom)
  const githubConnection = useAtomValue(githubConnectionAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const [showApiKeysDialog, setShowApiKeysDialog] = useState(false)
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)

  const handleSignOut = async () => {
    await redirectToSignOut()
    toast.success('You have been logged out.')
    setSession({ user: undefined })
    router.refresh()
  }

  const handleGitHubDisconnect = async () => {
    try {
      const response = await fetch('/api/auth/github/disconnect', { method: 'POST' })
      if (response.ok) {
        // Immediately update the atom to reflect disconnected state
        setGitHubConnection({ connected: false })
        toast.success('GitHub disconnected')
        router.refresh()
      } else {
        toast.error('Failed to disconnect GitHub')
      }
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error)
      toast.error('Failed to disconnect GitHub')
    }
  }

  // Fetch rate limit info
  const fetchRateLimit = async () => {
    try {
      const response = await fetch('/api/auth/rate-limit')
      if (response.ok) {
        const data = await response.json()
        setRateLimit({
          used: data.used,
          total: data.total,
          remaining: data.remaining,
        })
      }
    } catch (error) {
      console.error('Failed to fetch rate limit:', error)
    }
  }

  useEffect(() => {
    fetchRateLimit()
  }, [])

  return (
    <DropdownMenu onOpenChange={(open) => open && fetchRateLimit()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded-full"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatar ? `${user.avatar}&s=72` : undefined} alt={user.username} />
            <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-2">
          <div className="flex justify-between items-center text-sm font-medium">
            <span>{user.name ?? user.username}</span>
            <Badge variant="secondary" className="text-xs">
              {user.plan === 'hobby' ? 'Hobby' : user.plan === 'pro' ? 'Pro' : 'Enterprise'}
            </Badge>
          </div>
          {user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
          {rateLimit && (
            <div className="text-xs text-muted-foreground mt-1">
              {rateLimit.remaining}/{rateLimit.total} tasks remaining today
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => setShowApiKeysDialog(true)} className="cursor-pointer">
          <Key className="h-4 w-4 mr-2" />
          API Keys
        </DropdownMenuItem>

        {/* Only show GitHub Connect/Disconnect for Vercel users (not GitHub-authenticated users) */}
        {!user.id.startsWith('github-') && (
          <>
            {githubConnection.connected ? (
              <DropdownMenuItem onClick={handleGitHubDisconnect} className="cursor-pointer">
                <GitHubIcon className="h-4 w-4 mr-2" />
                Disconnect
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => (window.location.href = '/api/auth/github/signin')}
                className="cursor-pointer"
              >
                <GitHubIcon className="h-4 w-4 mr-2" />
                Connect
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          {user.id.startsWith('github-') ? (
            <>
              <GitHubIcon className="h-4 w-4 mr-2" />
              Log Out
            </>
          ) : (
            <>
              <svg viewBox="0 0 76 65" className="h-3 w-3 mr-2" fill="currentColor">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              Log Out
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>

      <ApiKeysDialog open={showApiKeysDialog} onOpenChange={setShowApiKeysDialog} />
    </DropdownMenu>
  )
}
