import type { VercelUser } from './types'

export async function fetchUser(accessToken: string) {
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
  const data = (await response.json()) as any
  const user = data.user || data

  console.log('Successfully fetched user:', user.username)
  console.log('User object keys:', Object.keys(user))
  console.log('User uid:', user.uid)
  console.log('User id:', user.id)
  return user as VercelUser
}
