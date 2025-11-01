import { NextResponse } from 'next/server'

const GITHUB_REPO = 'vercel-labs/coding-agent-template'
const CACHE_DURATION = 5 * 60 // 5 minutes in seconds

let cachedStars: number | null = null
let lastFetch = 0

export async function GET() {
  try {
    const now = Date.now()

    // Return cached value if still fresh
    if (cachedStars !== null && now - lastFetch < CACHE_DURATION * 1000) {
      return NextResponse.json({ stars: cachedStars })
    }

    // Fetch fresh data
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'coding-agent-template',
      },
      next: { revalidate: CACHE_DURATION },
    })

    if (!response.ok) {
      throw new Error('GitHub API request failed')
    }

    const data = await response.json()
    cachedStars = data.stargazers_count
    lastFetch = now

    return NextResponse.json({ stars: cachedStars })
  } catch (error) {
    console.error('Error fetching GitHub stars:', error)
    // Return cached value or fallback
    return NextResponse.json({ stars: cachedStars || 1200 })
  }
}
