'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import { type Session } from '@/lib/session/types'
import { useAtomValue } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'
import { useEffect, useState } from 'react'

export function User(props: { user?: Session['user'] | null; authProvider?: Session['authProvider'] | null }) {
  const session = useAtomValue(sessionAtom)
  const initialized = useAtomValue(sessionInitializedAtom)
  
  // Start with server props to prevent flash
  const [user, setUser] = useState(props.user ?? null)
  const [authProvider, setAuthProvider] = useState(props.authProvider ?? 'vercel')
  
  // Only update from session after initialization is complete
  useEffect(() => {
    if (initialized) {
      setUser(session.user)
      setAuthProvider(session.authProvider ?? 'vercel')
    }
  }, [initialized, session.user, session.authProvider])

  if (user) {
    return <SignOut user={user} authProvider={authProvider} />
  } else {
    return <SignIn />
  }
}
