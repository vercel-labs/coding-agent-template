import 'server-only'

import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { decrypt } from '@/lib/crypto'

type OAuthProvider = 'github' | 'vercel'

/**
 * Get the OAuth access token for a user from the database
 * Returns the decrypted token or null if not found
 */
export async function getOAuthToken(
  userId: string,
  provider: OAuthProvider,
): Promise<{ accessToken: string; expiresAt: Date | null } | null> {
  try {
    const connection = await db
      .select({ accessToken: userConnections.accessToken, expiresAt: userConnections.expiresAt })
      .from(userConnections)
      .where(and(eq(userConnections.userId, userId), eq(userConnections.provider, provider)))
      .limit(1)

    if (!connection[0]?.accessToken) {
      return null
    }

    return {
      accessToken: decrypt(connection[0].accessToken),
      expiresAt: connection[0].expiresAt,
    }
  } catch (error) {
    console.error(`Error fetching ${provider} token for user ${userId}:`, error)
    return null
  }
}

