import 'server-only'

import { db } from '@/lib/db/client'
import { users, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSessionFromReq } from '@/lib/session/server'
import { decrypt } from '@/lib/crypto'
import type { NextRequest } from 'next/server'

/**
 * Get the GitHub access token for the currently authenticated user
 * Returns null if user is not authenticated or hasn't connected GitHub
 *
 * Checks:
 * 1. Connected GitHub account (accounts table)
 * 2. Primary GitHub account (users table if they signed in with GitHub)
 *
 * @param req - Optional NextRequest for API routes
 */
export async function getUserGitHubToken(req?: NextRequest): Promise<string | null> {
  // Get session from request if provided, otherwise use server session
  const session = req ? await getSessionFromReq(req) : await getServerSession()

  if (!session?.user?.id) {
    return null
  }

  try {
    // First check if user has GitHub as a connected account
    const account = await db
      .select({ accessToken: accounts.accessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)

    if (account[0]?.accessToken) {
      return decrypt(account[0].accessToken)
    }

    // Fall back to checking if user signed in with GitHub (primary account)
    const user = await db
      .select({ accessToken: users.accessToken })
      .from(users)
      .where(and(eq(users.id, session.user.id), eq(users.provider, 'github')))
      .limit(1)

    if (user[0]?.accessToken) {
      return decrypt(user[0].accessToken)
    }

    return null
  } catch (error) {
    console.error('Error fetching user GitHub token:', error)
    return null
  }
}
