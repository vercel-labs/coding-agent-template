import 'server-only'

import type { Session } from './types'
import { SESSION_COOKIE_NAME } from './constants'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { upsertUser } from '@/lib/db/users'
import { encrypt } from '@/lib/crypto'
import ms from 'ms'

interface GitHubUser {
  login: string
  id: number
  email: string | null
  name: string | null
  avatar_url: string
}

export async function createGitHubSession(accessToken: string, scope?: string): Promise<Session | undefined> {
  // Fetch GitHub user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!userResponse.ok) {
    console.error('Failed to fetch GitHub user')
    return undefined
  }

  const githubUser = (await userResponse.json()) as GitHubUser

  // If email is not public, fetch it from the emails endpoint
  let email = githubUser.email
  if (!email) {
    try {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{ email: string; primary: boolean; verified: boolean }>
        const primaryEmail = emails.find((e) => e.primary && e.verified)
        email = primaryEmail?.email || emails[0]?.email || null
      }
    } catch (error) {
      console.error('Failed to fetch GitHub emails:', error)
    }
  }

  // Create or update user in database
  const userId = await upsertUser({
    provider: 'github',
    externalId: `${githubUser.id}`, // GitHub numeric ID
    accessToken: encrypt(accessToken), // Encrypt before storing
    refreshToken: undefined, // GitHub OAuth doesn't provide refresh tokens
    scope: scope || undefined,
    username: githubUser.login,
    email: email || undefined,
    name: githubUser.name || githubUser.login,
    avatarUrl: githubUser.avatar_url,
  })

  const session: Session = {
    created: Date.now(),
    authProvider: 'github',
    user: {
      id: userId, // Internal user ID
      username: githubUser.login,
      email: email || undefined,
      name: githubUser.name || githubUser.login,
      avatar: githubUser.avatar_url,
    },
  }

  console.log('Created GitHub session with internal user ID:', session.user.id)
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
