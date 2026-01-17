import 'server-only'

import { db } from '@/lib/db/client'
import { users, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSessionFromReq } from '@/lib/session/server'
import { decrypt } from '@/lib/crypto'
import type { NextRequest } from 'next/server'

/**
 * Get the GitHub access token for a user by their userId.
 * This is the core function that retrieves GitHub tokens.
 *
 * Checks:
 * 1. Connected GitHub account (accounts table)
 * 2. Primary GitHub account (users table if they signed in with GitHub)
 *
 * @param userId - The user's internal ID
 */
export async function getGitHubTokenByUserId(userId: string): Promise<string | null> {
  try {
    // First check if user has GitHub as a connected account
    const account = await db
      .select({ accessToken: accounts.accessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
      .limit(1)

    if (account[0]?.accessToken) {
      return decrypt(account[0].accessToken)
    }

    // Fall back to checking if user signed in with GitHub (primary account)
    const user = await db
      .select({ accessToken: users.accessToken })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.provider, 'github')))
      .limit(1)

    if (user[0]?.accessToken) {
      return decrypt(user[0].accessToken)
    }

    return null
  } catch (error) {
    console.error('Error fetching GitHub token by userId')
    return null
  }
}

/**
 * Get the GitHub access token for the currently authenticated user.
 * Returns null if user is not authenticated or hasn't connected GitHub.
 *
 * This function supports three authentication methods:
 * 1. Direct userId - For API token authentication (MCP, external clients)
 * 2. NextRequest - For API routes with session cookies
 * 3. No parameters - Uses getServerSession() for server components
 *
 * @param reqOrUserId - Optional NextRequest for API routes, or userId string for API token auth
 */
export async function getUserGitHubToken(reqOrUserId?: NextRequest | string): Promise<string | null> {
  let userId: string | undefined

  // Determine how to get the userId based on parameter type
  if (typeof reqOrUserId === 'string') {
    // Direct userId provided (e.g., from API token authentication)
    userId = reqOrUserId
  } else if (reqOrUserId) {
    // NextRequest provided - extract session from request
    const session = await getSessionFromReq(reqOrUserId)
    userId = session?.user?.id
  } else {
    // No parameter - use server session (for server components)
    const session = await getServerSession()
    userId = session?.user?.id
  }

  if (!userId) {
    return null
  }

  return getGitHubTokenByUserId(userId)
}
