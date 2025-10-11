import { type NextRequest } from 'next/server'
import { OAuth2Client, type OAuth2Tokens } from 'arctic'
import { createSession, saveSession } from '@/lib/session/create'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()
  const storedState = cookieStore.get(`vercel_oauth_state`)?.value ?? null
  const storedVerifier = cookieStore.get(`vercel_oauth_code_verifier`)?.value ?? null
  const storedRedirectTo = cookieStore.get(`vercel_oauth_redirect_to`)?.value ?? null

  if (
    code === null ||
    state === null ||
    storedState !== state ||
    storedRedirectTo === null ||
    storedVerifier === null
  ) {
    return new Response(null, {
      status: 400,
    })
  }

  const client = new OAuth2Client(
    process.env.VERCEL_CLIENT_ID ?? '',
    process.env.VERCEL_CLIENT_SECRET ?? '',
    `${req.nextUrl.origin}/api/auth/callback/vercel`,
  )

  let tokens: OAuth2Tokens

  try {
    tokens = await client.validateAuthorizationCode('https://vercel.com/api/login/oauth/token', code, storedVerifier)
  } catch (error) {
    console.error('Failed to validate authorization code:', error)
    return new Response(null, {
      status: 400,
    })
  }

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: storedRedirectTo,
    },
  })

  const session = await createSession({
    accessToken: tokens.accessToken(),
    expiresAt: tokens.accessTokenExpiresAt().getTime(),
  })

  if (!session) {
    console.error('[Vercel Callback] Failed to create session')
    return new Response('Failed to create session', { status: 500 })
  }

  // Store Vercel token in database (encrypted)
  const encryptedToken = encrypt(tokens.accessToken())
  const expiresAt = tokens.accessTokenExpiresAt()

  try {
    const existingConnection = await db
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.userId, session.user.id), eq(userConnections.provider, 'vercel')))
      .limit(1)

    if (existingConnection.length > 0) {
      // Update existing connection
      await db
        .update(userConnections)
        .set({
          accessToken: encryptedToken,
          expiresAt: expiresAt,
          username: session.user.username,
          updatedAt: new Date(),
        })
        .where(eq(userConnections.id, existingConnection[0].id))
    } else {
      // Insert new connection
      await db.insert(userConnections).values({
        id: nanoid(),
        userId: session.user.id,
        provider: 'vercel',
        accessToken: encryptedToken,
        expiresAt: expiresAt,
        username: session.user.username,
      })
    }
  } catch (error) {
    console.error('[Vercel Callback] Failed to store token in database:', error)
    // Continue anyway - token is in session for now
  }

  await saveSession(response, session)

  cookieStore.delete(`vercel_oauth_state`)
  cookieStore.delete(`vercel_oauth_code_verifier`)
  cookieStore.delete(`vercel_oauth_redirect_to`)

  return response
}
