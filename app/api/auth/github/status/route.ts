import { type NextRequest } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { users, accounts } from '@/lib/db/schema'
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
    // Check if user has GitHub as connected account
    const account = await db
      .select({
        username: accounts.username,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)

    if (account.length > 0) {
      return Response.json({
        connected: true,
        username: account[0].username,
        connectedAt: account[0].createdAt,
      })
    }

    // Check if user signed in with GitHub (primary account)
    const user = await db
      .select({
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, session.user.id), eq(users.provider, 'github')))
      .limit(1)

    if (user.length > 0) {
      return Response.json({
        connected: true,
        username: user[0].username,
        connectedAt: user[0].createdAt,
      })
    }

    return Response.json({ connected: false })
  } catch (error) {
    console.error('Error checking GitHub connection status:', error)
    return Response.json({ connected: false, error: 'Failed to check status' }, { status: 500 })
  }
}
