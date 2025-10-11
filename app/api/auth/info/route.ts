import type { NextRequest } from 'next/server'
import type { Session, SessionUserInfo, Tokens } from '@/lib/session/types'
import { createSession, saveSession } from '@/lib/session/create'
import { saveSession as saveGitHubSession } from '@/lib/session/create-github'
import { getSessionFromReq } from '@/lib/session/server'
import { getOAuthToken } from '@/lib/session/get-oauth-token'

export async function GET(req: NextRequest) {
  const existingSession = await getSessionFromReq(req)

  // For GitHub users, just return the existing session without recreating it
  // For Vercel users, recreate the session to refresh user data
  let session: Session | undefined
  if (existingSession && existingSession.authProvider === 'github') {
    session = existingSession
  } else if (existingSession) {
    // Fetch Vercel token from database to recreate session
    const tokenData = await getOAuthToken(existingSession.user.id, 'vercel')
    if (tokenData) {
      const tokens: Tokens = {
        accessToken: tokenData.accessToken,
        expiresAt: tokenData.expiresAt?.getTime(),
      }
      session = await createSession(tokens)
    } else {
      session = existingSession
    }
  } else {
    session = undefined
  }

  const response = new Response(JSON.stringify(await getData(session)), {
    headers: { 'Content-Type': 'application/json' },
  })

  // Use the appropriate saveSession function based on auth provider
  if (session && session.authProvider === 'github') {
    await saveGitHubSession(response, session)
  } else {
    await saveSession(response, session)
  }

  return response
}

async function getData(session: Session | undefined): Promise<SessionUserInfo> {
  if (!session) {
    return { user: undefined }
  } else {
    return { user: session.user, authProvider: session.authProvider }
  }
}
