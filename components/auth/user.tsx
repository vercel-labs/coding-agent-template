'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import { type Session } from '@/lib/session/types'
import { useAtomValue } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'

export function User(props: { user?: Session['user'] | null; authProvider?: Session['authProvider'] | null }) {
  const session = useAtomValue(sessionAtom)
  const initialized = useAtomValue(sessionInitializedAtom)

  // Use session data once initialized, otherwise use server props to prevent flash
  const user = initialized ? (session.user ?? null) : (props.user ?? null)
  const authProvider = initialized ? (session.authProvider ?? 'vercel') : (props.authProvider ?? 'vercel')

  if (user) {
    return <SignOut user={user} authProvider={authProvider} />
  } else {
    return <SignIn />
  }
}
