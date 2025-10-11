import 'server-only'

import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

/**
 * Get the GitHub access token for the currently authenticated user
 * Returns null if user is not authenticated or hasn't connected GitHub
 */
export async function getUserGitHubToken(): Promise<string | null> {
  const session = await getServerSession()
  
  if (!session?.user) {
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

