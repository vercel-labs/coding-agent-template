import 'server-only'

import type { Session, Tokens } from './types'
import { SESSION_COOKIE_NAME } from './constants'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { fetchTeams } from '@/lib/vercel-client/teams'
import { fetchUser } from '@/lib/vercel-client/user'
import { getHighestAccountLevel } from '@/lib/vercel-client/utils'
import { upsertUser } from '@/lib/db/users'
import { encrypt } from '@/lib/crypto'
import ms from 'ms'

export async function createSession(tokens: Tokens): Promise<Session | undefined> {
  const [user, teams] = await Promise.all([fetchUser(tokens.accessToken), fetchTeams(tokens.accessToken)])

  if (!user) {
    console.log('Failed to fetch user')
    return undefined
  }

  // Teams may fail due to permissions - default to hobby plan if unavailable
  const plan = teams ? getHighestAccountLevel(teams) : { plan: 'hobby' as const, team: null }

  // Create or update user in database
  const externalId = user.uid || user.id || ''
  const userId = await upsertUser({
    provider: 'vercel',
    externalId,
    accessToken: encrypt(tokens.accessToken), // Encrypt before storing
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined, // Encrypt if present
    scope: undefined, // Vercel doesn't provide scope
    username: user.username,
    email: user.email,
    name: user.name,
    avatarUrl: `https://vercel.com/api/www/avatar/?u=${user.username}`,
  })

  const session = {
    created: Date.now(),
    authProvider: 'vercel' as const,
    user: {
      id: userId, // Internal user ID
      username: user.username,
      email: user.email,
      name: user.name,
      avatar: `https://vercel.com/api/www/avatar/?u=${user.username}`,
    },
  }

  console.log('Created session with internal user ID:', session.user.id)
  return session
}

const COOKIE_TTL = ms('1y')

export async function saveSession(res: Response, session: Session | undefined): Promise<string | undefined> {
  if (!session) {
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax`,
    )
    return
  }

  const value = await encryptJWE(session, '1y')
  const expires = new Date(Date.now() + COOKIE_TTL).toUTCString()
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_TTL / 1000}; Expires=${expires}; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax`,
  )
  return value
}
