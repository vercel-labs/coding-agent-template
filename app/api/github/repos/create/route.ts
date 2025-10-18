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

    // Template repository mappings - actual boilerplate/starter templates
    const templates: Record<string, { owner: string; repo: string; url: string; isTemplate: boolean }> = {
      nextjs: {
        owner: 'ctate',
        repo: 'nextjs-starter',
        url: 'https://github.com/ctate/nextjs-starter',
        isTemplate: false, // Will use fallback method
      },
      nuxt: {
        owner: 'viandwi24',
        repo: 'nuxt3-awesome-starter',
        url: 'https://github.com/viandwi24/nuxt3-awesome-starter',
        isTemplate: true,
      },
      remix: {
        owner: 'remix-run',
        repo: 'indie-stack',
        url: 'https://github.com/remix-run/indie-stack',
        isTemplate: true,
      },
      react: {
        owner: 'kriasoft',
        repo: 'react-starter-kit',
        url: 'https://github.com/kriasoft/react-starter-kit',
        isTemplate: true,
      },
      vue: {
        owner: 'antfu-collective',
        repo: 'vitesse',
        url: 'https://github.com/antfu-collective/vitesse',
        isTemplate: true,
      },
      express: {
        owner: 'hagopj13',
        repo: 'node-express-boilerplate',
        url: 'https://github.com/hagopj13/node-express-boilerplate',
        isTemplate: true,
      },
      typescript: {
        owner: 'BearStudio',
        repo: 'start-ui-web',
        url: 'https://github.com/BearStudio/start-ui-web',
        isTemplate: true,
      },
    }

    try {
      // Check if owner is an org or the user's personal account
      let repo

      // Determine the target owner
      const { data: user } = await octokit.users.getAuthenticated()
      const targetOwner = owner || user.login

      // Check if we should use a template
      if (template && template !== 'blank' && templates[template]) {
        const templateInfo = templates[template]

        // Try GitHub's template repository feature first
        try {
          repo = await octokit.repos.createUsingTemplate({
            template_owner: templateInfo.owner,
            template_repo: templateInfo.repo,
            owner: targetOwner,
            name,
            description: description || undefined,
            private: isPrivate || false,
            include_all_branches: false,
          })
        } catch (templateError: unknown) {
          console.error('Template creation error - falling back to blank repo with template reference:', templateError)

          // If template creation fails, create a blank repo with reference to the template
          // This happens when the template repo doesn't have the template feature enabled
          const templateNote = description
            ? `${description} (Clone from ${templateInfo.url} to use template)`
            : `Clone from ${templateInfo.url} to use template`

          // Create blank repository with template reference
          if (owner) {
            if (user.login === owner) {
              repo = await octokit.repos.createForAuthenticatedUser({
                name,
                description: templateNote,
                private: isPrivate || false,
                auto_init: true,
              })
            } else {
              repo = await octokit.repos.createInOrg({
                org: owner,
                name,
                description: templateNote,
                private: isPrivate || false,
                auto_init: true,
              })
            }
          } else {
            repo = await octokit.repos.createForAuthenticatedUser({
              name,
              description: templateNote,
              private: isPrivate || false,
              auto_init: true,
            })
          }

          // Return with a note about the template
          return NextResponse.json({
            success: true,
            name: repo.data.name,
            full_name: repo.data.full_name,
            clone_url: repo.data.clone_url,
            html_url: repo.data.html_url,
            private: repo.data.private,
            template_info: {
              url: templateInfo.url,
              message: `Repository created. To use the ${template} template, clone or copy files from ${templateInfo.url}`,
            },
          })
        }
      } else {
        // Create blank repository
        if (owner) {
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
