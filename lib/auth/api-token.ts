import { NextRequest } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db/client'
import { apiTokens, users, type User } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('hex')
  const hash = hashToken(raw)
  const prefix = raw.slice(0, 8)
  return { raw, hash, prefix }
}

export async function getAuthFromRequest(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const hash = hashToken(token)

    const [tokenRecord] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).limit(1)

    if (!tokenRecord) {
      return null
    }

    // Check expiry FIRST before updating lastUsedAt
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return null
    }

    const [user] = await db.select().from(users).where(eq(users.id, tokenRecord.userId)).limit(1)

    if (!user) {
      return null
    }

    // Only update lastUsedAt if token is valid (not expired)
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.tokenHash, hash))

    return user
  }

  const session = await getServerSession()
  if (!session?.user?.id) {
    return null
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

  return user || null
}
