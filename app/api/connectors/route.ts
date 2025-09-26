import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { connectors } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'

export async function GET() {
  try {
    const allConnectors = await db.select().from(connectors)

    const decryptedConnectors = allConnectors.map((connector) => ({
      ...connector,
      oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
    }))

    return NextResponse.json({
      success: true,
      data: decryptedConnectors,
    })
  } catch (error) {
    console.error('Error fetching connectors:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch connectors',
        data: [],
      },
      { status: 500 },
    )
  }
}
