'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useSetAtom } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'
import { githubConnectionAtom, githubConnectionInitializedAtom } from '@/lib/atoms/github-connection'
import { fetcher } from '@/lib/hooks/use-swr-fetcher'
import type { SessionUserInfo } from '@/lib/session/types'
import type { GitHubConnection } from '@/lib/atoms/github-connection'

const SWR_CONFIG = {
  refreshInterval: 60000, // Poll every 60 seconds
  revalidateOnFocus: true, // Refresh when window gains focus
  revalidateOnReconnect: true, // Refresh when network reconnects
  dedupingInterval: 5000, // Deduplicate requests within 5 seconds
  shouldRetryOnError: true,
}

export function SessionProvider() {
  const setSession = useSetAtom(sessionAtom)
  const setInitialized = useSetAtom(sessionInitializedAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const setGitHubInitialized = useSetAtom(githubConnectionInitializedAtom)

  // Fetch session data with SWR (automatic polling, focus revalidation, deduplication)
  const { data: sessionData, error: sessionError } = useSWR<SessionUserInfo>('/api/auth/info', fetcher, SWR_CONFIG)

  // Fetch GitHub connection status with SWR
  const { data: githubData, error: githubError } = useSWR<GitHubConnection>(
    '/api/auth/github/status',
    fetcher,
    SWR_CONFIG,
  )

  // Update session atom when data changes
  useEffect(() => {
    if (sessionData !== undefined) {
      setSession(sessionData)
      setInitialized(true)
    } else if (sessionError) {
      setSession({ user: undefined })
      setInitialized(true)
    }
  }, [sessionData, sessionError, setSession, setInitialized])

  // Update GitHub connection atom when data changes
  useEffect(() => {
    if (githubData !== undefined) {
      setGitHubConnection(githubData)
      setGitHubInitialized(true)
    } else if (githubError) {
      setGitHubConnection({ connected: false })
      setGitHubInitialized(true)
    }
  }, [githubData, githubError, setGitHubConnection, setGitHubInitialized])

  return null
}
