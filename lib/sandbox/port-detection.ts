import { Octokit } from '@octokit/rest'

/**
 * Detects the appropriate port for a project based on its dependencies.
 * Checks package.json from GitHub to determine if it's a Vite project.
 *
 * @param repoUrl - The GitHub repository URL
 * @param githubToken - Optional GitHub token for authentication
 * @returns The appropriate port number (5173 for Vite, 3000 as default)
 */
export async function detectPortFromRepo(repoUrl: string, githubToken?: string | null): Promise<number> {
  try {
    // Parse the GitHub URL to extract owner and repo
    const urlMatch = repoUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+?)(\.git)?$/)
    if (!urlMatch) {
      // Not a GitHub URL, use default port
      return 3000
    }

    const [, owner, repo] = urlMatch

    // Create Octokit instance
    const octokit = new Octokit({
      auth: githubToken || undefined,
    })

    // Fetch package.json from the repository
    let packageJsonContent: string
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: 'package.json',
      })

      // Check if it's a file (not a directory or symlink)
      if ('content' in data && data.type === 'file') {
        // Decode base64 content
        packageJsonContent = Buffer.from(data.content, 'base64').toString('utf-8')
      } else {
        // Not a file, use default
        return 3000
      }
    } catch (error) {
      // package.json doesn't exist or can't be accessed, use default
      return 3000
    }

    // Parse package.json
    const packageJson = JSON.parse(packageJsonContent)

    // Check if Vite is in dependencies or devDependencies
    const hasVite =
      (packageJson.dependencies && 'vite' in packageJson.dependencies) ||
      (packageJson.devDependencies && 'vite' in packageJson.devDependencies)

    if (hasVite) {
      return 5173 // Vite's default port
    }

    // Default to port 3000
    return 3000
  } catch (error) {
    // If any error occurs during detection, fall back to default port
    console.error('Error detecting port from repository:', error)
    return 3000
  }
}
