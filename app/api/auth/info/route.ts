import type { NextRequest } from 'next/server'
import type { Session, SessionUserInfo } from '@/lib/session/types'
import { createSession, saveSession } from '@/lib/session/create'
import { saveSession as saveGitHubSession } from '@/lib/session/create-github'
import { getSessionFromReq } from '@/lib/session/server'

export async function GET(req: NextRequest) {
  const existingSession = await getSessionFromReq(req)
  
  // Check if this is a GitHub user (ID starts with 'github-')
  const isGitHubUser = existingSession?.user?.id?.startsWith('github-')
  
  // For GitHub users, just return the existing session without recreating it
  // For Vercel users, recreate the session to refresh user data
  const session = existingSession && isGitHubUser
    ? existingSession
    : await (existingSession ? createSession(existingSession.tokens) : Promise.resolve(undefined))

  const response = new Response(JSON.stringify(await getData(session)), {
    headers: { 'Content-Type': 'application/json' },
  })

  // Use the appropriate saveSession function based on user type
  if (session && isGitHubUser) {
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
    return { user: session.user }
  }
}
