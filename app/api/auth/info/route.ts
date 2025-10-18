import type { NextRequest } from 'next/server'
import type { Session, SessionUserInfo } from '@/lib/session/types'
import { getSessionFromReq } from '@/lib/session/server'

export async function GET(req: NextRequest) {
  const existingSession = await getSessionFromReq(req)

  // Return existing session without recreating it
  // This prevents unnecessary session recreation and cookie rewrites
  const session = existingSession

  const response = new Response(JSON.stringify(await getData(session)), {
    headers: { 'Content-Type': 'application/json' },
  })

  // Only save session if it was modified (never in this case now)
  // This prevents frequent cookie rewrites that can cause session loss

  return response
}

async function getData(session: Session | undefined): Promise<SessionUserInfo> {
  if (!session) {
    return { user: undefined }
  } else {
    return { user: session.user, authProvider: session.authProvider }
  }
}
