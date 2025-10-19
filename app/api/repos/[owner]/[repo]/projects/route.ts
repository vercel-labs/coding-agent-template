import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOAuthToken } from '@/lib/session/get-oauth-token'
import { Vercel } from '@vercel/sdk'
import { fetchUser } from '@/lib/vercel-client/user'
import { fetchTeams } from '@/lib/vercel-client/teams'

interface VercelProject {
  id: string
  name: string
  framework?: string | null
  link?: {
    type: string
    repo: string
    repoId: number
  }
  latestDeployments?: Array<{
    url: string
    state: string
    ready: boolean
    createdAt: number
  }>
  createdAt?: number
  updatedAt?: number
}

export async function GET(request: NextRequest, context: { params: Promise<{ owner: string; repo: string }> }) {
  try {
    const { owner, repo } = await context.params
    const session = await getServerSession()

    if (!session || session.authProvider !== 'vercel') {
      return NextResponse.json({ error: 'Vercel authentication required' }, { status: 401 })
    }

    // Get Vercel access token
    const tokenData = await getOAuthToken(session.user.id, 'vercel')
    if (!tokenData) {
      return NextResponse.json({ error: 'No Vercel token found' }, { status: 401 })
    }

    const vercel = new Vercel({
      bearerToken: tokenData.accessToken,
    })

    // Get user and teams to check all scopes
    const [user, teams] = await Promise.all([fetchUser(tokenData.accessToken), fetchTeams(tokenData.accessToken)])

    if (!user) {
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 500 })
    }

    // Collect all team/user IDs to check
    const teamIds = [
      user.uid || user.id || '', // Personal account
      ...(teams || []).map((team) => team.id), // Team accounts
    ]

    // Fetch projects for all teams/users
    const repoFullName = `${owner}/${repo}`
    const allProjects: VercelProject[] = []

    for (const teamId of teamIds) {
      try {
        const response = await vercel.projects.getProjects({
          teamId,
        })

        const projects = (response.projects || []) as VercelProject[]

        // Filter projects that are linked to this GitHub repository
        const filteredProjects = projects.filter((project: VercelProject) => {
          const link = project.link
          return link && link.type === 'github' && link.repo === repoFullName
        })

        allProjects.push(...filteredProjects)
      } catch (error) {
        // Skip teams where we don't have access
        console.error('Error fetching projects for team:', error)
      }
    }

    return NextResponse.json({ projects: allProjects })
  } catch (error) {
    console.error('Error fetching Vercel projects:', error)
    return NextResponse.json({ error: 'Failed to fetch Vercel projects' }, { status: 500 })
  }
}
