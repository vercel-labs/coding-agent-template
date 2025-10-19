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
 * @param teamId - Team ID (or user ID for personal account). If null/undefined, creates under personal account.
 * @param params - Project creation parameters
 * @returns The created project data
 */
export async function createProject(
  accessToken: string,
  teamId: string | null | undefined,
  params: CreateProjectParams,
): Promise<CreateProjectResponse | undefined> {
  try {
    // Build URL - only add teamId query param if provided
    let url = 'https://api.vercel.com/v10/projects'
    if (teamId) {
      url += `?teamId=${encodeURIComponent(teamId)}`
    }

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
