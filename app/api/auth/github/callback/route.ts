import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { users, accounts, tasks, connectors, keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createGitHubSession, saveSession } from '@/lib/session/create-github'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()

  // Check if this is a sign-in flow or connect flow
  const authMode = cookieStore.get(`github_auth_mode`)?.value ?? null
  const isSignInFlow = authMode === 'signin'
  const isConnectFlow = authMode === 'connect'

  // Try both cookie patterns (new unified flow vs legacy oauth flow)
  const storedState = cookieStore.get(authMode ? `github_auth_state` : `github_oauth_state`)?.value ?? null
  const storedRedirectTo =
    cookieStore.get(authMode ? `github_auth_redirect_to` : `github_oauth_redirect_to`)?.value ?? null
  const storedUserId = cookieStore.get(`github_oauth_user_id`)?.value ?? null // Required for connect flow

  // For sign-in flow, we don't need storedUserId
  if (isSignInFlow) {
    if (code === null || state === null || storedState !== state || storedRedirectTo === null) {
      return new Response('Invalid OAuth state', {
        status: 400,
      })
    }
  } else {
    // For connect flow (including legacy oauth flow), we need storedUserId
    if (
      code === null ||
      state === null ||
      storedState !== state ||
      storedRedirectTo === null ||
      storedUserId === null
    ) {
      return new Response('Invalid OAuth state', {
        status: 400,
      })
    }
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth not configured', {
      status: 500,
    })
  }

  try {
    console.log('[GitHub Callback] Starting OAuth flow, mode:', authMode)

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

    if (!tokenResponse.ok) {
      console.error('[GitHub Callback] Token exchange failed with status:', tokenResponse.status)
      const errorText = await tokenResponse.text()
      console.error('[GitHub Callback] Error response:', errorText)
      return new Response('Failed to exchange code for token', { status: 400 })
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      scope: string
      token_type: string
      error?: string
      error_description?: string
    }

    console.log('[GitHub Callback] Token data received, has access_token:', !!tokenData.access_token)

    if (!tokenData.access_token) {
      console.error('[GitHub Callback] Failed to get GitHub access token:', tokenData)
      return new Response(
        `Failed to authenticate with GitHub: ${tokenData.error_description || tokenData.error || 'Unknown error'}`,
        { status: 400 },
      )
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

    if (isSignInFlow) {
      // SIGN-IN FLOW: Create a new session for the GitHub user
      console.log('[GitHub Callback] Sign-in flow - creating GitHub session')
      const session = await createGitHubSession(tokenData.access_token, tokenData.scope)

      if (!session) {
        console.error('[GitHub Callback] Failed to create GitHub session')
        return new Response('Failed to create session', { status: 500 })
      }

      console.log('[GitHub Callback] GitHub session created for user:', session.user.id)
      // Note: Tokens are already stored in users table by upsertUser() in createGitHubSession()

      // Create response with redirect
      const response = new Response(null, {
        status: 302,
        headers: {
          Location: storedRedirectTo,
        },
      })

      // Save session to cookie
      await saveSession(response, session)

      // Clean up cookies
      cookieStore.delete(`github_auth_state`)
      cookieStore.delete(`github_auth_redirect_to`)
      cookieStore.delete(`github_auth_mode`)

      return response
    } else {
      // CONNECT FLOW: Add GitHub account to existing Vercel user
      // Encrypt the access token before storing
      const encryptedToken = encrypt(tokenData.access_token)

      // Check if this GitHub account is already connected somewhere
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, `${githubUser.id}`)))
        .limit(1)

      if (existingAccount.length > 0) {
        const connectedUserId = existingAccount[0].userId

        // If the GitHub account belongs to a different user, we need to merge accounts
        if (connectedUserId !== storedUserId) {
          console.log(
            `[GitHub Callback] Merging accounts: GitHub account ${githubUser.id} belongs to user ${connectedUserId}, connecting to user ${storedUserId}`,
          )

          // Transfer all tasks, connectors, accounts, and keys from old user to new user
          await db.update(tasks).set({ userId: storedUserId! }).where(eq(tasks.userId, connectedUserId))
          await db.update(connectors).set({ userId: storedUserId! }).where(eq(connectors.userId, connectedUserId))
          await db.update(accounts).set({ userId: storedUserId! }).where(eq(accounts.userId, connectedUserId))
          await db.update(keys).set({ userId: storedUserId! }).where(eq(keys.userId, connectedUserId))

          // Delete the old user record (this will cascade delete their accounts/keys)
          await db.delete(users).where(eq(users.id, connectedUserId))

          console.log(
            `[GitHub Callback] Account merge complete. Old user ${connectedUserId} merged into ${storedUserId}`,
          )

          // Update the GitHub account token
          await db
            .update(accounts)
            .set({
              userId: storedUserId!,
              accessToken: encryptedToken,
              scope: tokenData.scope,
              username: githubUser.login,
              updatedAt: new Date(),
            })
            .where(eq(accounts.id, existingAccount[0].id))
        } else {
          // Same user, just update the token
          await db
            .update(accounts)
            .set({
              accessToken: encryptedToken,
              scope: tokenData.scope,
              username: githubUser.login,
              updatedAt: new Date(),
            })
            .where(eq(accounts.id, existingAccount[0].id))
        }
      } else {
        // No existing GitHub account connection, create a new one
        await db.insert(accounts).values({
          id: nanoid(),
          userId: storedUserId!,
          provider: 'github',
          externalUserId: `${githubUser.id}`, // Store GitHub numeric ID
          accessToken: encryptedToken,
          scope: tokenData.scope,
          username: githubUser.login,
        })
      }

      // Clean up cookies (handle both new and legacy cookie names)
      if (authMode) {
        cookieStore.delete(`github_auth_state`)
        cookieStore.delete(`github_auth_redirect_to`)
        cookieStore.delete(`github_auth_mode`)
      } else {
        cookieStore.delete(`github_oauth_state`)
        cookieStore.delete(`github_oauth_redirect_to`)
      }
      cookieStore.delete(`github_oauth_user_id`)

      // Redirect back to app
      return Response.redirect(new URL(storedRedirectTo, req.nextUrl.origin))
    }
  } catch (error) {
    console.error('[GitHub Callback] OAuth callback error:', error)
    console.error('[GitHub Callback] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return new Response(
      `Failed to complete GitHub authentication: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 },
    )
  }
}
