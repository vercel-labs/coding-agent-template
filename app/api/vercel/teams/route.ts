import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOAuthToken } from '@/lib/session/get-oauth-token'
import { fetchTeams } from '@/lib/vercel-client/teams'
import { fetchUser } from '@/lib/vercel-client/user'

export async function GET() {
  try {
    const session = await getServerSession()

    if (!session?.user?.id || session.authProvider !== 'vercel') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Vercel access token
    const tokenData = await getOAuthToken(session.user.id, 'vercel')
    if (!tokenData) {
      return NextResponse.json({ error: 'No Vercel token found' }, { status: 401 })
    }

    // Fetch user info and teams
    const [user, teams] = await Promise.all([fetchUser(tokenData.accessToken), fetchTeams(tokenData.accessToken)])

    if (!user) {
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 500 })
    }

    // Build scopes list: personal account + teams
    const scopes = [
      {
        id: user.uid || user.id || '',
        slug: user.username,
        name: user.name || user.username,
        type: 'personal' as const,
      },
      ...(teams || []).map((team) => ({
        id: team.id,
        slug: team.slug,
        name: team.name,
        type: 'team' as const,
      })),
    ]

    return NextResponse.json({ scopes })
  } catch (error) {
    console.error('Error fetching Vercel teams:', error)
    return NextResponse.json({ error: 'Failed to fetch Vercel teams' }, { status: 500 })
  }
}
