import { type NextRequest } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await getSessionFromReq(req)

  if (!session?.user) {
    console.log('Disconnect GitHub: No session found')
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!session.user.id) {
    console.error('Session user.id is undefined. Session:', session)
    return Response.json({ error: 'Invalid session - user ID missing' }, { status: 400 })
  }

  // Can only disconnect if user didn't sign in with GitHub
  if (session.authProvider === 'github') {
    return Response.json({ error: 'Cannot disconnect primary authentication method' }, { status: 400 })
  }

  console.log('Disconnecting GitHub account for user:', session.user.id)

  try {
    await db.delete(accounts).where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))

    console.log('GitHub account disconnected successfully for user:', session.user.id)
    return Response.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    return Response.json(
      { error: 'Failed to disconnect', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
