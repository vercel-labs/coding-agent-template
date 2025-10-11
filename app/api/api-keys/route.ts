import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encrypt, decrypt } from '@/lib/crypto'

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userKeys = await db
      .select({
        provider: keys.provider,
        createdAt: keys.createdAt,
      })
      .from(keys)
      .where(eq(keys.userId, session.user.id))

    return NextResponse.json({
      success: true,
      apiKeys: userKeys,
    })
  } catch (error) {
    console.error('Error fetching API keys:', error)
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { provider, apiKey } = body as { provider: Provider; apiKey: string }

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'Provider and API key are required' }, { status: 400 })
    }

    if (!['openai', 'gemini', 'cursor', 'anthropic', 'aigateway'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Check if key already exists
    const existing = await db
      .select()
      .from(keys)
      .where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))
      .limit(1)

    const encryptedKey = encrypt(apiKey)

    if (existing.length > 0) {
      // Update existing
      await db
        .update(keys)
        .set({
          value: encryptedKey,
          updatedAt: new Date(),
        })
        .where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))
    } else {
      // Insert new
      await db.insert(keys).values({
        id: nanoid(),
        userId: session.user.id,
        provider,
        value: encryptedKey,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving API key:', error)
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const provider = searchParams.get('provider') as Provider

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    await db.delete(keys).where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting API key:', error)
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }
}
