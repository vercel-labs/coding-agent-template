import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { checkRateLimit } from '@/lib/utils/rate-limit'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = await checkRateLimit(session.user.id)

    return NextResponse.json({
      allowed: rateLimit.allowed,
      remaining: rateLimit.remaining,
      used: 5 - rateLimit.remaining,
      total: 5,
      resetAt: rateLimit.resetAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching rate limit:', error)
    return NextResponse.json({ error: 'Failed to fetch rate limit' }, { status: 500 })
  }
}

