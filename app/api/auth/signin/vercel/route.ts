import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { CodeChallengeMethod, OAuth2Client, generateCodeVerifier, generateState } from 'arctic'

export async function POST(req: NextRequest): Promise<Response> {
  const client = new OAuth2Client(
    process.env.NEXT_PUBLIC_VERCEL_CLIENT_ID ?? '',
    process.env.VERCEL_CLIENT_SECRET ?? '',
    `${req.nextUrl.origin}/api/auth/callback/vercel`,
  )

  const state = generateState()
  const verifier = generateCodeVerifier()
  const url = client.createAuthorizationURLWithPKCE(
    'https://vercel.com/oauth/authorize',
    state,
    CodeChallengeMethod.S256,
    verifier,
    [], // Vercel uses default scopes
  )

  const store = await cookies()
  const redirectTo = isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/')
    ? (req.nextUrl.searchParams.get('next') ?? '/')
    : '/'

  for (const [key, value] of [
    [`vercel_oauth_redirect_to`, redirectTo],
    [`vercel_oauth_state`, state],
    [`vercel_oauth_code_verifier`, verifier],
  ]) {
    store.set(key, value, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10,
      sameSite: 'lax',
    })
  }

  return Response.json({ url })
}
