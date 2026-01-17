import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware to transform query parameter authentication to Bearer token headers.
 * This allows MCP clients to authenticate using ?apikey=xxx query parameters,
 * which are then transformed into Authorization: Bearer xxx headers.
 *
 * Only applies to /api/mcp routes.
 *
 * Security Note: Query parameters may appear in logs. This is acceptable for
 * development and internal tools, but prefer header-based auth for production.
 */
export function middleware(request: NextRequest) {
  // Only apply to MCP routes
  if (!request.nextUrl.pathname.startsWith('/api/mcp')) {
    return NextResponse.next()
  }

  const apiKey = request.nextUrl.searchParams.get('apikey')

  if (apiKey) {
    // Clone request with new Authorization header
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('Authorization', `Bearer ${apiKey}`)

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/mcp/:path*',
}
