'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import { type Session } from '@/lib/session/types'
import { useAtomValue } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'

export function User(props: { user?: Session['user'] | null }) {
  const session = useAtomValue(sessionAtom)
  const initialized = useAtomValue(sessionInitializedAtom)
  const user = initialized ? session.user : props.user

  if (user) {
    return <SignOut user={user} />
  } else {
    return <SignIn />
  }
}
