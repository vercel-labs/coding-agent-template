/**
 * Shared SWR fetcher utility for request deduplication and caching.
 *
 * Implements the `client-swr-dedup` Vercel React best practice:
 * SWR provides stale-while-revalidate caching, automatic request
 * deduplication across components, focus revalidation, and network
 * reconnect revalidation out of the box.
 *
 * Usage:
 *   import useSWR from 'swr'
 *   import { fetcher } from '@/lib/hooks/use-swr-fetcher'
 *
 *   const { data, error } = useSWR('/api/some-endpoint', fetcher)
 */
export const fetcher = async (url: string) => {
  const res = await fetch(url)

  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.')
    throw error
  }

  return res.json()
}
