import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github/client'

export async function GET(request: NextRequest, context: { params: Promise<{ owner: string; repo: string }> }) {
  try {
    const { owner, repo } = await context.params

    const octokit = await getOctokit()

    if (!octokit.auth) {
      return NextResponse.json({ error: 'GitHub authentication required' }, { status: 401 })
    }

    // Fetch classic projects from the repository using the REST API
    // Note: This uses the projects classic API endpoint
    const response = await octokit.request('GET /repos/{owner}/{repo}/projects', {
      owner,
      repo,
      per_page: 100,
      headers: {
        accept: 'application/vnd.github+json',
      },
    })

    return NextResponse.json({ projects: response.data })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
