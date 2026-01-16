import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/lib/auth/api-token'
import { db } from '@/lib/db/client'
import { apiTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { generateApiToken } from '@/lib/auth/api-token'
import { z } from 'zod'

const createTokenSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  expiresAt: z.string().datetime().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthFromRequest(req)

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))

    return NextResponse.json({ tokens })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthFromRequest(req)

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validationResult = createTokenSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { name, expiresAt } = validationResult.data

    // Rate limiting: max 20 tokens per user
    const existingTokens = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.userId, user.id))

    if (existingTokens.length >= 20) {
      return NextResponse.json({ error: 'Maximum token limit reached' }, { status: 429 })
    }

    const { raw, hash, prefix } = generateApiToken()

    await db.insert(apiTokens).values({
      userId: user.id,
      name,
      tokenHash: hash,
      tokenPrefix: prefix,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })

    return NextResponse.json({ token: raw }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
