import { cache } from 'react'

const GITHUB_REPO = 'agenticassets/AA-coding-agent'
const CACHE_DURATION = 5 * 60 // 5 minutes in seconds

// React.cache() deduplicates calls within a single server request/render tree
// next.revalidate provides cross-request caching (5 minutes)
export const getGitHubStars = cache(async function getGitHubStars(): Promise<number> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AA-coding-agent',
      },
      next: { revalidate: CACHE_DURATION },
    })

    if (!response.ok) {
      throw new Error('GitHub API request failed')
    }

    const data = await response.json()
    return data.stargazers_count || 1200
  } catch (error) {
    console.error('Error fetching GitHub stars')
    return 1200 // Fallback value
  }
})
