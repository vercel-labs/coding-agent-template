import type { NextRequest } from 'next/server'
import type { Session, SessionUserInfo } from '@/lib/session/types'
import { createSession, saveSession } from '@/lib/session/create'
import { getSessionFromReq } from '@/lib/session/server'

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req).then((session) => (session ? createSession(session.tokens) : undefined))

  const response = new Response(JSON.stringify(await getData(session)), {
    headers: { 'Content-Type': 'application/json' },
  })

  await saveSession(response, session)
  return response
}

async function getData(session: Session | undefined): Promise<SessionUserInfo> {
  if (!session) {
    return { user: undefined }
  } else {
    return { user: session.user }
  }
}
