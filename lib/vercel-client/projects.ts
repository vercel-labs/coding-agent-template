export interface CreateProjectRequest {
  name: string
  framework?: string
  gitRepository?: {
    repo: string // format: "owner/repo"
    type: 'github'
  }
}

export interface VercelProject {
  id: string
  name: string
  framework?: string
  accountId: string
  createdAt: number
  updatedAt: number
}

/**
 * Create a new Vercel project
 * @param accessToken - Vercel access token
 * @param teamId - Team ID (optional, if creating in a team scope)
 * @param projectData - Project configuration
 * @returns Created project data
 */
export async function createProject(
  accessToken: string,
  teamId: string | undefined,
  projectData: CreateProjectRequest,
): Promise<VercelProject | undefined> {
  // Build URL with optional team ID parameter
  const url = new URL('https://api.vercel.com/v10/projects')
  if (teamId) {
    url.searchParams.append('teamId', teamId)
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(projectData),
  })

  if (response.status !== 200 && response.status !== 201) {
    const errorText = await response.text()
    console.error('Failed to create Vercel project:', response.status, errorText)
    return undefined
  }

  const project = (await response.json()) as VercelProject
  console.log('Successfully created Vercel project')
  return project
}
