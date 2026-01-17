import { NextRequest, NextResponse } from 'next/server'
import { getUserGitHubToken } from '@/lib/github/user-token'

interface GitHubRepo {
  name: string
  full_name: string
  description?: string
  private: boolean
  clone_url: string
  updated_at: string
  language?: string
  owner: {
    login: string
  }
}

interface GitHubSearchResult {
  total_count: number
  incomplete_results: boolean
  items: GitHubRepo[]
}

export async function GET(request: NextRequest) {
  try {
    const token = await getUserGitHubToken(request)

    if (!token) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const perPage = parseInt(searchParams.get('per_page') || '25', 10)
    const search = searchParams.get('search') || ''

    // Get authenticated user
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: 401 })
    }

    const user = await userResponse.json()
    const username = user.login

    // If there's a search query, use GitHub search API
    if (search.trim()) {
      // Search for repos the user has access to matching the query
      const searchQuery = encodeURIComponent(`${search} in:name user:${username} fork:true`)
      const searchUrl = `https://api.github.com/search/repositories?q=${searchQuery}&sort=updated&order=desc&per_page=${perPage}&page=${page}`

      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!searchResponse.ok) {
        throw new Error('Failed to search repositories')
      }

      const searchResult: GitHubSearchResult = await searchResponse.json()

      return NextResponse.json({
        repos: searchResult.items.map((repo) => ({
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner.login,
          description: repo.description,
          private: repo.private,
          clone_url: repo.clone_url,
          updated_at: repo.updated_at,
          language: repo.language,
        })),
        page,
        per_page: perPage,
        has_more: searchResult.total_count > page * perPage,
        total_count: searchResult.total_count,
        username,
      })
    }

    // No search query - fetch repos sorted by updated_at (most recent first) for pagination
    // We use a larger page size and handle deduplication ourselves
    const githubPerPage = 100
    const githubPage = Math.ceil((page * perPage) / githubPerPage)

    // Fetch user's repos (owned repos, sorted by recently updated)
    const apiUrl = `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=${githubPerPage}&page=${githubPage}&visibility=all&affiliation=owner,organization_member`

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch repositories')
    }

    const repos: GitHubRepo[] = await response.json()

    // Calculate the offset within the GitHub page
    const offsetInGithubPage = ((page - 1) * perPage) % githubPerPage
    const slicedRepos = repos.slice(offsetInGithubPage, offsetInGithubPage + perPage)

    // Check if there are more repos
    const hasMore = repos.length === githubPerPage || slicedRepos.length === perPage

    return NextResponse.json({
      repos: slicedRepos.map((repo) => ({
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        description: repo.description,
        private: repo.private,
        clone_url: repo.clone_url,
        updated_at: repo.updated_at,
        language: repo.language,
      })),
      page,
      per_page: perPage,
      has_more: hasMore,
      username,
    })
  } catch (error) {
    console.error('Error fetching user repositories:')
    return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 })
  }
}
