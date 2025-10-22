'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import { type Session } from '@/lib/session/types'
import { useAtomValue } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'
import { useMemo } from 'react'

export function User(props: { user?: Session['user'] | null; authProvider?: Session['authProvider'] | null }) {
  const session = useAtomValue(sessionAtom)
  const initialized = useAtomValue(sessionInitializedAtom)

  // Use session values if initialized, otherwise use props
  const user = useMemo(
    () => (initialized ? (session.user ?? null) : (props.user ?? null)),
    [initialized, session.user, props.user],
  )
  const authProvider = useMemo(
    () => (initialized ? (session.authProvider ?? 'vercel') : (props.authProvider ?? 'vercel')),
    [initialized, session.authProvider, props.authProvider],
  )

  if (user) {
    return <SignOut user={user} authProvider={authProvider} />
  } else {
    return <SignIn />
  }
}
