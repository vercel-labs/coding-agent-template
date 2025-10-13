import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromReq } from '@/lib/session/server'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { generateState } from 'arctic'

export async function GET(req: NextRequest): Promise<Response> {
  // Check if user is authenticated with Vercel first
  const session = await getSessionFromReq(req)
  if (!session?.user) {
    return Response.redirect(new URL('/', req.url))
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const redirectUri = `${req.nextUrl.origin}/api/auth/github/callback`

  if (!clientId) {
    return Response.redirect(new URL('/?error=github_not_configured', req.url))
  }

  const state = generateState()
  const store = await cookies()
  const redirectTo = isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/')
    ? (req.nextUrl.searchParams.get('next') ?? '/')
    : '/'

  // Store state and redirect URL
  for (const [key, value] of [
    [`github_oauth_redirect_to`, redirectTo],
    [`github_oauth_state`, state],
    [`github_oauth_user_id`, session.user.id], // Store Vercel user ID
  ]) {
    store.set(key, value, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10, // 10 minutes
      sameSite: 'lax',
    })
  }

  // Build GitHub authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state,
  })

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`

  // Redirect directly to GitHub
  return Response.redirect(url)
}

export async function POST(req: NextRequest): Promise<Response> {
  // Check if user is authenticated with Vercel first
  const session = await getSessionFromReq(req)
  if (!session?.user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const redirectUri = `${req.nextUrl.origin}/api/auth/github/callback`

  if (!clientId) {
    return Response.json({ error: 'GitHub OAuth not configured' }, { status: 500 })
  }

  const state = generateState()
  const store = await cookies()
  const redirectTo = isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/')
    ? (req.nextUrl.searchParams.get('next') ?? '/')
    : '/'

  // Store state and redirect URL
  for (const [key, value] of [
    [`github_oauth_redirect_to`, redirectTo],
    [`github_oauth_state`, state],
    [`github_oauth_user_id`, session.user.id], // Store Vercel user ID
  ]) {
    store.set(key, value, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10, // 10 minutes
      sameSite: 'lax',
    })
  }

  // Build GitHub authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state,
  })

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`

  return Response.json({ url })
}
