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

export function SignOut({ user }: Pick<Session, 'user'>) {
  const router = useRouter()
  const setSession = useSetAtom(sessionAtom)
  const githubConnection = useAtomValue(githubConnectionAtom)

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

  return (
    <DropdownMenu>
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
        <div className="px-2 py-2 border-b">
          <div className="flex justify-between items-center text-sm font-medium">
            <span>{user.name ?? user.username}</span>
            <Badge variant="secondary" className="text-xs">
              {user.plan === 'hobby' ? 'Hobby' : user.plan === 'pro' ? 'Pro' : 'Enterprise'}
            </Badge>
          </div>
          {user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
        </div>

        {githubConnection.connected && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleGitHubDisconnect} className="cursor-pointer">
              <GitHubIcon className="h-4 w-4 mr-2" />
              Disconnect GitHub ({githubConnection.username})
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
