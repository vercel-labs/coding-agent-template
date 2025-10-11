import { type NextRequest } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await getSessionFromReq(req)

  if (!session?.user) {
    console.log('Disconnect GitHub: No session found')
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Debug: Log the entire user object
  console.log('Session user object:', JSON.stringify(session.user, null, 2))

  if (!session.user.id) {
    console.error('Session user.id is undefined. Session:', session)
    return Response.json({ error: 'Invalid session - user ID missing' }, { status: 400 })
  }

  console.log('Disconnecting GitHub for user:', session.user.id)

  try {
    const result = await db
      .delete(userConnections)
      .where(and(eq(userConnections.userId, session.user.id), eq(userConnections.provider, 'github')))

    console.log('GitHub disconnected successfully for user:', session.user.id)
    return Response.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    return Response.json({ error: 'Failed to disconnect', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
