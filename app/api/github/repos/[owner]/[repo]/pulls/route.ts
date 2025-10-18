import { NextRequest, NextResponse } from 'next/server'
import { getUserGitHubToken } from '@/lib/github/user-token'

export async function GET(request: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  try {
    const token = await getUserGitHubToken(request)

    if (!token) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 401 })
    }

    const { owner, repo } = await params

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch pull requests')
    }

    const pulls = await response.json()

    return NextResponse.json(
      pulls.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        user: {
          login: pr.user.login,
          avatar_url: pr.user.avatar_url,
        },
        html_url: pr.html_url,
      })),
    )
  } catch (error) {
    console.error('Error fetching pull requests:', error)
    return NextResponse.json({ error: 'Failed to fetch pull requests' }, { status: 500 })
  }
}
