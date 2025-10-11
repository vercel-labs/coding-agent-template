import { type NextRequest } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await getSessionFromReq(req)
  
  if (!session?.user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    await db
      .delete(userConnections)
      .where(and(eq(userConnections.userId, session.user.id), eq(userConnections.provider, 'github')))

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}

