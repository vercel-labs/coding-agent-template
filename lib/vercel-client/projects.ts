interface CreateProjectParams {
  name: string
  gitRepository?: {
    type: 'github'
    repo: string // Format: "owner/repo"
  }
  framework?: string | null
}

interface CreateProjectResponse {
  id: string
  name: string
  accountId: string
  framework: string | null
  link?: {
    type: string
    repo: string
    repoId: number
  }
}

/**
 * Create a Vercel project
 * @param accessToken - Vercel OAuth access token
 * @param teamId - Team ID (for teams) or User ID (for personal accounts)
 * @param params - Project creation parameters
 * @returns The created project data
 */
export async function createProject(
  accessToken: string,
  teamId: string,
  params: CreateProjectParams,
): Promise<CreateProjectResponse | undefined> {
  try {
    const url = `https://api.vercel.com/v9/projects?teamId=${encodeURIComponent(teamId)}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to create Vercel project', response.status, errorText)

      // If 403, it's likely due to insufficient OAuth scopes
      if (response.status === 403) {
        console.error(
          'Permission denied - this may indicate insufficient OAuth scopes. User may need to reconnect their Vercel account.',
        )
      }

      return undefined
    }

    const project = (await response.json()) as CreateProjectResponse
    console.log('Successfully created Vercel project')
    return project
  } catch (error) {
    console.error('Error creating Vercel project:', error)
    return undefined
  }
}
