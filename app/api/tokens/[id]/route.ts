import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/lib/auth/api-token'
import { db } from '@/lib/db/client'
import { apiTokens } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthFromRequest(req)

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const [token] = await db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))
      .limit(1)

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
