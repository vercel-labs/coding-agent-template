import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { Octokit } from '@octokit/rest'

interface RepoTemplate {
  id: string
  name: string
  description: string
  sourceRepo?: string
  sourceFolder?: string
}

// Helper function to copy files from template repository
async function populateRepoFromTemplate(octokit: Octokit, repoOwner: string, repoName: string, template: RepoTemplate) {
  if (!template.sourceRepo || !template.sourceFolder) {
    return
  }

  // Parse source repository
  const sourceMatch = template.sourceRepo.match(/github\.com\/([\w-]+)\/([\w-]+)/)
  if (!sourceMatch) {
    throw new Error('Invalid source repository URL')
  }

  const [, sourceOwner, sourceRepoName] = sourceMatch

  try {
    // Get the tree of the source folder
    const { data: contents } = await octokit.repos.getContent({
      owner: sourceOwner,
      repo: sourceRepoName,
      path: template.sourceFolder,
    })

    if (!Array.isArray(contents)) {
      return
    }

    // Fetch and create each file
    for (const item of contents) {
      if (item.type === 'file' && item.download_url) {
        try {
          // Download file content
          const response = await fetch(item.download_url)
          const content = await response.text()

          // Create file in new repository
          await octokit.repos.createOrUpdateFileContents({
            owner: repoOwner,
            repo: repoName,
            path: item.name,
            message: `Add ${item.name} from template`,
            content: Buffer.from(content).toString('base64'),
          })
        } catch (error) {
          console.error('Error copying file:', error)
          // Continue with other files even if one fails
        }
      }
    }
  } catch (error) {
    console.error('Error populating repository from template:', error)
    throw error
  }
}

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
    const { name, description, private: isPrivate, owner, template } = await request.json()

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
          } catch (error: unknown) {
            if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
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

      // If a template is selected, populate the repository
      if (template && template.id !== 'none') {
        try {
          await populateRepoFromTemplate(octokit, repo.data.owner.login, repo.data.name, template as RepoTemplate)
        } catch (error) {
          console.error('Error populating repository from template:', error)
          // Don't fail the entire operation if template population fails
          // The repository was created successfully, just without template files
        }
      }

      return NextResponse.json({
        success: true,
        name: repo.data.name,
        full_name: repo.data.full_name,
        clone_url: repo.data.clone_url,
        html_url: repo.data.html_url,
        private: repo.data.private,
      })
    } catch (error: unknown) {
      console.error('GitHub API error:', error)

      // Handle specific GitHub API errors
      if (error && typeof error === 'object' && 'status' in error) {
        if (error.status === 422) {
          return NextResponse.json({ error: 'Repository already exists or name is invalid' }, { status: 422 })
        }

        if (error.status === 403) {
          return NextResponse.json(
            { error: 'You do not have permission to create repositories in this organization' },
            { status: 403 },
          )
        }
      }

      throw error
    }
  } catch (error) {
    console.error('Error creating repository:', error)
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 })
  }
}
