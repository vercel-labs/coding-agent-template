import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { Octokit } from '@octokit/rest'

export async function POST(request: Request) {
  try {
    // Get the authenticated user's session
    const session = await getServerSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's GitHub token
    const token = await getUserGitHubToken()

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not found. Please reconnect your GitHub account.' },
        { status: 401 },
      )
    }

    // Parse request body
    const { name, description, private: isPrivate, owner } = await request.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Repository name is required' }, { status: 400 })
    }

    // Validate repository name format
    const repoNamePattern = /^[a-zA-Z0-9._-]+$/
    if (!repoNamePattern.test(name)) {
      return NextResponse.json(
        { error: 'Repository name can only contain alphanumeric characters, periods, hyphens, and underscores' },
        { status: 400 },
      )
    }

    // Initialize Octokit with user's token
    const octokit = new Octokit({ auth: token })

    try {
      // Check if owner is an org or the user's personal account
      let repo

      if (owner) {
        // First, check if the owner is the user's personal account
        const { data: user } = await octokit.users.getAuthenticated()

        if (user.login === owner) {
          // Create in user's personal account
          repo = await octokit.repos.createForAuthenticatedUser({
            name,
            description: description || undefined,
            private: isPrivate || false,
            auto_init: true, // Initialize with README
          })
        } else {
          // Try to create in organization
          try {
            repo = await octokit.repos.createInOrg({
              org: owner,
              name,
              description: description || undefined,
              private: isPrivate || false,
              auto_init: true, // Initialize with README
            })
          } catch (error: any) {
            if (error.status === 404) {
              return NextResponse.json(
                { error: 'Organization not found or you do not have permission to create repositories' },
                { status: 403 },
              )
            }
            throw error
          }
        }
      } else {
        // Create in user's personal account if no owner specified
        repo = await octokit.repos.createForAuthenticatedUser({
          name,
          description: description || undefined,
          private: isPrivate || false,
          auto_init: true, // Initialize with README
        })
      }

      return NextResponse.json({
        success: true,
        name: repo.data.name,
        full_name: repo.data.full_name,
        clone_url: repo.data.clone_url,
        html_url: repo.data.html_url,
        private: repo.data.private,
      })
    } catch (error: any) {
      console.error('GitHub API error:', error)

      // Handle specific GitHub API errors
      if (error.status === 422) {
        return NextResponse.json({ error: 'Repository already exists or name is invalid' }, { status: 422 })
      }

      if (error.status === 403) {
        return NextResponse.json(
          { error: 'You do not have permission to create repositories in this organization' },
          { status: 403 },
        )
      }

      throw error
    }
  } catch (error) {
    console.error('Error creating repository:', error)
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 })
  }
}
