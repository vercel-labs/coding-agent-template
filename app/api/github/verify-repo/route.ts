import { NextRequest, NextResponse } from 'next/server'
import { getUserGitHubToken } from '@/lib/github/user-token'

export async function GET(request: NextRequest) {
  try {
    const token = await getUserGitHubToken(request)

    if (!token) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const owner = searchParams.get('owner')
    const repo = searchParams.get('repo')

    if (!owner || !repo) {
      return NextResponse.json({ error: 'Owner and repo parameters are required' }, { status: 400 })
    }

    // Try to fetch the repository to check if it's accessible
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ accessible: false, error: 'Repository not found' }, { status: 200 })
      }
      return NextResponse.json({ accessible: false, error: 'Failed to verify repository' }, { status: 200 })
    }

    const repoData = await response.json()

    // Return repo info including owner details
    return NextResponse.json({
      accessible: true,
      owner: {
        login: repoData.owner.login,
        name: repoData.owner.login, // Use login as name if name is not available
        avatar_url: repoData.owner.avatar_url,
      },
      repo: {
        name: repoData.name,
        full_name: repoData.full_name,
        description: repoData.description,
        private: repoData.private,
        clone_url: repoData.clone_url,
        language: repoData.language,
      },
    })
  } catch (error) {
    console.error('Error verifying GitHub repository:', error)
    return NextResponse.json({ accessible: false, error: 'Failed to verify repository' }, { status: 500 })
  }
}
