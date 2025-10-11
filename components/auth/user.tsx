'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import { type Session } from '@/lib/session/types'
import { useAtomValue } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'

export function User(props: { user?: Session['user'] | null; authProvider?: Session['authProvider'] | null }) {
  const session = useAtomValue(sessionAtom)
  const initialized = useAtomValue(sessionInitializedAtom)
  const user = initialized ? session.user : props.user
  const authProvider = initialized ? session.authProvider : props.authProvider

  if (user) {
    return <SignOut user={user} authProvider={authProvider || 'vercel'} />
  } else {
    return <SignIn />
  }
}
