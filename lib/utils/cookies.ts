import Cookies from 'js-cookie'

const SIDEBAR_WIDTH_COOKIE = 'sidebar-width'
const SIDEBAR_OPEN_COOKIE = 'sidebar-open'
const DEFAULT_SIDEBAR_WIDTH = 288
const DEFAULT_SIDEBAR_OPEN = false // Default to false to avoid hydration issues

export function getSidebarWidth(): number {
  if (typeof window === 'undefined') {
    // Server-side: try to get from cookie
    return DEFAULT_SIDEBAR_WIDTH
  }

  const cookieValue = Cookies.get(SIDEBAR_WIDTH_COOKIE)
  if (cookieValue) {
    const width = parseInt(cookieValue, 10)
    if (!isNaN(width) && width >= 200 && width <= 600) {
      return width
    }
  }

  return DEFAULT_SIDEBAR_WIDTH
}

export function setSidebarWidth(width: number): void {
  if (typeof window === 'undefined') return

  // Validate width
  if (width >= 200 && width <= 600) {
    Cookies.set(SIDEBAR_WIDTH_COOKIE, width.toString(), {
      expires: 365, // 1 year
      sameSite: 'strict',
    })
  }
}

export function getSidebarWidthFromCookie(cookieString?: string): number {
  if (!cookieString) return DEFAULT_SIDEBAR_WIDTH

  const cookies = cookieString
    .split(';')
    .map((cookie) => cookie.trim().split('='))
    .reduce(
      (acc, [key, value]) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, string>,
    )

  const width = parseInt(cookies[SIDEBAR_WIDTH_COOKIE] || '', 10)
  if (!isNaN(width) && width >= 200 && width <= 600) {
    return width
  }

  return DEFAULT_SIDEBAR_WIDTH
}

// Sidebar open/closed state functions
export function getSidebarOpen(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_SIDEBAR_OPEN
  }

  const cookieValue = Cookies.get(SIDEBAR_OPEN_COOKIE)
  if (cookieValue) {
    return cookieValue === 'true'
  }

  return DEFAULT_SIDEBAR_OPEN
}

export function setSidebarOpen(isOpen: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(SIDEBAR_OPEN_COOKIE, isOpen.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

export function getSidebarOpenFromCookie(cookieString?: string): boolean {
  if (!cookieString) return DEFAULT_SIDEBAR_OPEN

  const cookies = cookieString
    .split(';')
    .map((cookie) => cookie.trim().split('='))
    .reduce(
      (acc, [key, value]) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, string>,
    )

  const isOpen = cookies[SIDEBAR_OPEN_COOKIE]
  if (isOpen !== undefined) {
    return isOpen === 'true'
  }

  return DEFAULT_SIDEBAR_OPEN
}
