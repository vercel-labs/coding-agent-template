import { type NextRequest } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req)

  if (!session?.user) {
    return Response.json({ connected: false })
  }

  if (!session.user.id) {
    console.error('GitHub status check: session.user.id is undefined')
    return Response.json({ connected: false })
  }

  try {
    const connection = await db
      .select({
        username: userConnections.username,
        createdAt: userConnections.createdAt,
      })
      .from(userConnections)
      .where(and(eq(userConnections.userId, session.user.id), eq(userConnections.provider, 'github')))
      .limit(1)

    if (connection.length > 0) {
      return Response.json({
        connected: true,
        username: connection[0].username,
        connectedAt: connection[0].createdAt,
      })
    }

    return Response.json({ connected: false })
  } catch (error) {
    console.error('Error checking GitHub connection status:', error)
    return Response.json({ connected: false, error: 'Failed to check status' }, { status: 500 })
  }
}
