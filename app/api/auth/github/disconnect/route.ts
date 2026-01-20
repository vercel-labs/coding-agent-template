import { type NextRequest } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (!session.user.id) {
      console.error('Session user.id is undefined')
      return Response.json({ error: 'Invalid session - user ID missing' }, { status: 400 })
    }

    // Can only disconnect if user didn't sign in with GitHub
    if (session.authProvider === 'github') {
      return Response.json({ error: 'Cannot disconnect primary authentication method' }, { status: 400 })
    }

    await db.delete(accounts).where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting GitHub')
    return Response.json(
      { error: 'Failed to disconnect', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
