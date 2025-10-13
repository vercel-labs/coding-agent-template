import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { generateState } from 'arctic'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { getSessionFromReq } from '@/lib/session/server'

export async function GET(req: NextRequest): Promise<Response> {
  // Check if user is already authenticated with Vercel
  const session = await getSessionFromReq(req)

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const redirectUri = `${req.nextUrl.origin}/api/auth/github/callback`

  if (!clientId) {
    return Response.redirect(new URL('/?error=github_not_configured', req.url))
  }

  const state = generateState()
  const store = await cookies()
  let redirectTo = isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/')
    ? (req.nextUrl.searchParams.get('next') ?? '/')
    : '/'

  // If user is already authenticated with Vercel, treat this as a "Connect GitHub" flow
  // Otherwise, treat it as a "Sign in with GitHub" flow
  const isSignInFlow = !session?.user
  const authMode = isSignInFlow ? 'signin' : 'connect'

  // Add a query parameter to show a toast message after redirect
  if (!isSignInFlow) {
    const redirectUrl = new URL(redirectTo, req.nextUrl.origin)
    redirectUrl.searchParams.set('github_connected', 'true')
    redirectTo = redirectUrl.pathname + redirectUrl.search
  }

  // Store state and redirect URL
  const cookiesToSet: [string, string][] = [
    [`github_auth_redirect_to`, redirectTo],
    [`github_auth_state`, state],
    [`github_auth_mode`, authMode],
  ]

  // If connecting (user already signed in), store their user ID
  if (!isSignInFlow && session?.user?.id) {
    cookiesToSet.push([`github_oauth_user_id`, session.user.id])
  }

  for (const [key, value] of cookiesToSet) {
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
