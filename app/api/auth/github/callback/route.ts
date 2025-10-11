import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { userConnections } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()

  const storedState = cookieStore.get(`github_oauth_state`)?.value ?? null
  const storedRedirectTo = cookieStore.get(`github_oauth_redirect_to`)?.value ?? null
  const storedUserId = cookieStore.get(`github_oauth_user_id`)?.value ?? null

  if (code === null || state === null || storedState !== state || storedRedirectTo === null || storedUserId === null) {
    return new Response('Invalid OAuth state', {
      status: 400,
    })
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth not configured', {
      status: 500,
    })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    })

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      scope: string
      token_type: string
    }

    if (!tokenData.access_token) {
      console.error('Failed to get GitHub access token:', tokenData)
      return new Response('Failed to authenticate with GitHub', { status: 400 })
    }

    // Fetch GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    const githubUser = (await userResponse.json()) as {
      login: string
      id: number
    }

    // Store or update connection in database
    const existingConnection = await db
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.userId, storedUserId), eq(userConnections.provider, 'github')))
      .limit(1)

    if (existingConnection.length > 0) {
      // Update existing connection
      await db
        .update(userConnections)
        .set({
          accessToken: tokenData.access_token,
          scope: tokenData.scope,
          username: githubUser.login,
          updatedAt: new Date(),
        })
        .where(eq(userConnections.id, existingConnection[0].id))
    } else {
      // Insert new connection
      await db.insert(userConnections).values({
        id: nanoid(),
        userId: storedUserId,
        provider: 'github',
        accessToken: tokenData.access_token,
        scope: tokenData.scope,
        username: githubUser.login,
      })
    }

    // Clean up cookies
    cookieStore.delete(`github_oauth_state`)
    cookieStore.delete(`github_oauth_redirect_to`)
    cookieStore.delete(`github_oauth_user_id`)

    // Redirect back to app
    return Response.redirect(new URL(storedRedirectTo, req.nextUrl.origin))
  } catch (error) {
    console.error('GitHub OAuth callback error:', error)
    return new Response('Failed to complete GitHub authentication', { status: 500 })
  }
}
