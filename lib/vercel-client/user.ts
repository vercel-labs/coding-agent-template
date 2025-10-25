import type { VercelUser } from './types'

export async function fetchUser(accessToken: string): Promise<VercelUser | undefined> {
  // Try the user endpoint
  let response = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (response.status !== 200) {
    console.error('Failed to fetch user from v2 endpoint', response.status, await response.text())

    // Fallback to www/user endpoint
    response = await fetch('https://vercel.com/api/www/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })

    if (response.status !== 200) {
      console.error('Failed to fetch user from www endpoint', response.status, await response.text())
      return undefined
    }
  }

  // Try to parse response - format may vary by endpoint
  const data = (await response.json()) as { user?: VercelUser } | VercelUser
  const user: VercelUser | undefined = 'user' in data && data.user ? data.user : 'username' in data ? data : undefined

  if (!user) {
    console.error('No user data in response')
    return undefined
  }

  return user
}
