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

    if (!owner) {
      return NextResponse.json({ error: 'Owner parameter is required' }, { status: 400 })
    }

    // First, get the authenticated user to check if this is their repos
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    let isAuthenticatedUser = false
    if (userResponse.ok) {
      const user = await userResponse.json()
      isAuthenticatedUser = user.login === owner
    }

    interface GitHubRepo {
      name: string
      full_name: string
      description?: string
      private: boolean
      clone_url: string
      updated_at: string
      language?: string
    }

    // Fetch all repositories by paginating through all pages
    const allRepos: GitHubRepo[] = []
    let page = 1
    const perPage = 100 // GitHub's maximum per page

    while (true) {
      let apiUrl: string

      if (isAuthenticatedUser) {
        // Use /user/repos for authenticated user to get private repos, but only owned repos
        apiUrl = `https://api.github.com/user/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}&visibility=all&affiliation=owner`
      } else {
        // Check if it's an organization
        const orgResponse = await fetch(`https://api.github.com/orgs/${owner}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })

        if (orgResponse.ok) {
          // Use /orgs/{org}/repos for organizations to get private repos
          apiUrl = `https://api.github.com/orgs/${owner}/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}`
        } else {
          // Fallback to /users/{owner}/repos (public only)
          apiUrl = `https://api.github.com/users/${owner}/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}`
        }
      }

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const repos = await response.json()

      // If we get fewer repos than the per_page limit, we've reached the end
      if (repos.length === 0) {
        break
      }

      allRepos.push(...repos)

      // If we got fewer than the max per page, we've reached the end
      if (repos.length < perPage) {
        break
      }

      page++
    }

    // Remove duplicates based on full_name (owner/repo)
    const uniqueRepos = allRepos.filter(
      (repo, index, self) => index === self.findIndex((r) => r.full_name === repo.full_name),
    )

    // Sort alphabetically by name (GitHub API sort might not be perfect)
    uniqueRepos.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

    return NextResponse.json(
      uniqueRepos.map((repo) => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        clone_url: repo.clone_url,
        updated_at: repo.updated_at,
        language: repo.language,
      })),
    )
  } catch (error) {
    console.error('Error fetching GitHub repositories:', error)
    return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 })
  }
}
