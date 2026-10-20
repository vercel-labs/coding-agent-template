export const PARALLEL_SEARCH_NAME = 'Parallel Search'
export const PARALLEL_SEARCH_URL = 'https://search.parallel.ai/mcp'

// Identify this application on requests to Parallel, including manually added connectors.
// Other remote servers keep their existing headers.
export function parallelSearchHeaders(baseUrl: string | null): Record<string, string> {
  if (!baseUrl) return {}

  try {
    const url = new URL(baseUrl)
    if (url.origin === 'https://search.parallel.ai' && /^\/mcp\/?$/.test(url.pathname)) {
      return { 'User-Agent': 'coding-agent-template/2.0.0' }
    }
  } catch {
    // Invalid connector URLs are handled by connector validation.
  }

  return {}
}
