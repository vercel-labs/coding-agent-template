import 'server-only'

import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSessionFromReq } from '@/lib/session/server'
import type { NextRequest } from 'next/server'

/**
 * Get the GitHub access token for the currently authenticated user
 * Returns null if user is not authenticated or hasn't connected GitHub
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
    const connection = await db
      .select({ accessToken: userConnections.accessToken })
      .from(userConnections)
      .where(and(eq(userConnections.userId, session.user.id), eq(userConnections.provider, 'github')))
      .limit(1)

    return connection[0]?.accessToken ?? null
  } catch (error) {
    console.error('Error fetching user GitHub token:', error)
    return null
  }
}
