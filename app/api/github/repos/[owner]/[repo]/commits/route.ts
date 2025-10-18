import { NextRequest, NextResponse } from 'next/server'
import { getUserGitHubToken } from '@/lib/github/user-token'

export async function GET(request: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  try {
    const token = await getUserGitHubToken(request)

    if (!token) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 401 })
    }

    const { owner, repo } = await params

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch commits')
    }

    const commits = await response.json()

    return NextResponse.json(
      commits.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date,
        },
        html_url: commit.html_url,
      })),
    )
  } catch (error) {
    console.error('Error fetching commits:', error)
    return NextResponse.json({ error: 'Failed to fetch commits' }, { status: 500 })
  }
}
