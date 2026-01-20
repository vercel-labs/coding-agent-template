import { NextRequest, NextResponse } from 'next/server'
import { getUserGitHubToken } from '@/lib/github/user-token'

interface GitHubBranch {
  name: string
  protected: boolean
}

interface GitHubRepo {
  default_branch: string
}

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

    // Fetch repository metadata to get default branch
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
      }
      if (repoResponse.status === 403) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      console.error('Failed to fetch repository metadata')
      return NextResponse.json({ error: 'Failed to fetch repository' }, { status: 500 })
    }

    const repoData: GitHubRepo = await repoResponse.json()
    const defaultBranch = repoData.default_branch

    // Fetch all branches with pagination
    const allBranches: GitHubBranch[] = []
    let page = 1
    const perPage = 100 // GitHub's maximum per page

    while (true) {
      const branchesResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      )

      if (!branchesResponse.ok) {
        if (branchesResponse.status === 404) {
          return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
        }
        if (branchesResponse.status === 403) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        console.error('Failed to fetch branches')
        return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
      }

      const branches: GitHubBranch[] = await branchesResponse.json()

      // If we get no branches, we've reached the end
      if (branches.length === 0) {
        break
      }

      allBranches.push(...branches)

      // If we got fewer than the max per page, we've reached the end
      if (branches.length < perPage) {
        break
      }

      page++
    }

    // Sort branches: default branch first, then alphabetically
    const sortedBranches = allBranches.sort((a, b) => {
      // Default branch always comes first
      if (a.name === defaultBranch) return -1
      if (b.name === defaultBranch) return 1

      // Then alphabetically
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })

    return NextResponse.json({
      branches: sortedBranches.map((branch) => ({
        name: branch.name,
        protected: branch.protected,
      })),
      defaultBranch,
    })
  } catch (error) {
    console.error('Error fetching GitHub branches')
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
  }
}
