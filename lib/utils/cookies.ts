import Cookies from 'js-cookie'

const SIDEBAR_WIDTH_COOKIE = 'sidebar-width'
const SIDEBAR_OPEN_COOKIE = 'sidebar-open'
const LOGS_PANE_HEIGHT_COOKIE = 'logs-pane-height'
const LOGS_PANE_COLLAPSED_COOKIE = 'logs-pane-collapsed'
const INSTALL_DEPENDENCIES_COOKIE = 'install-dependencies'
const MAX_DURATION_COOKIE = 'max-duration'
const KEEP_ALIVE_COOKIE = 'keep-alive'
const SELECTED_OWNER_COOKIE = 'selected-owner'
const SELECTED_REPO_COOKIE = 'selected-repo'
const SHOW_FILES_PANE_COOKIE = 'show-files-pane'
const SHOW_CODE_PANE_COOKIE = 'show-code-pane'
const SHOW_PREVIEW_PANE_COOKIE = 'show-preview-pane'
const SHOW_CHAT_PANE_COOKIE = 'show-chat-pane'
const DEFAULT_SIDEBAR_WIDTH = 288
const DEFAULT_SIDEBAR_OPEN = false // Default to false to avoid hydration issues
const DEFAULT_LOGS_PANE_HEIGHT = 200
const DEFAULT_LOGS_PANE_COLLAPSED = true // Default to collapsed
const DEFAULT_INSTALL_DEPENDENCIES = false
const DEFAULT_MAX_DURATION = 5
const DEFAULT_KEEP_ALIVE = false
const DEFAULT_SHOW_FILES_PANE = true
const DEFAULT_SHOW_CODE_PANE = true
const DEFAULT_SHOW_PREVIEW_PANE = false
const DEFAULT_SHOW_CHAT_PANE = true

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

// Logs pane height functions
export function getLogsPaneHeight(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_LOGS_PANE_HEIGHT
  }

  const cookieValue = Cookies.get(LOGS_PANE_HEIGHT_COOKIE)
  if (cookieValue) {
    const height = parseInt(cookieValue, 10)
    if (!isNaN(height) && height >= 100 && height <= 600) {
      return height
    }
  }

  return DEFAULT_LOGS_PANE_HEIGHT
}

export function setLogsPaneHeight(height: number): void {
  if (typeof window === 'undefined') return

  // Validate height
  if (height >= 100 && height <= 600) {
    Cookies.set(LOGS_PANE_HEIGHT_COOKIE, height.toString(), {
      expires: 365, // 1 year
      sameSite: 'strict',
    })
  }
}

// Logs pane collapsed state functions
export function getLogsPaneCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_LOGS_PANE_COLLAPSED
  }

  const cookieValue = Cookies.get(LOGS_PANE_COLLAPSED_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_LOGS_PANE_COLLAPSED
}

export function setLogsPaneCollapsed(isCollapsed: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(LOGS_PANE_COLLAPSED_COOKIE, isCollapsed.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

// Task options functions
export function getInstallDependencies(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_INSTALL_DEPENDENCIES
  }

  const cookieValue = Cookies.get(INSTALL_DEPENDENCIES_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_INSTALL_DEPENDENCIES
}

export function setInstallDependencies(installDeps: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(INSTALL_DEPENDENCIES_COOKIE, installDeps.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

export function getMaxDuration(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_MAX_DURATION
  }

  const cookieValue = Cookies.get(MAX_DURATION_COOKIE)
  if (cookieValue) {
    const duration = parseInt(cookieValue, 10)
    if (!isNaN(duration) && duration >= 1 && duration <= 30) {
      return duration
    }
  }

  return DEFAULT_MAX_DURATION
}

export function setMaxDuration(duration: number): void {
  if (typeof window === 'undefined') return

  // Validate duration
  if (duration >= 1 && duration <= 30) {
    Cookies.set(MAX_DURATION_COOKIE, duration.toString(), {
      expires: 365, // 1 year
      sameSite: 'strict',
    })
  }
}

export function getKeepAlive(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_KEEP_ALIVE
  }

  const cookieValue = Cookies.get(KEEP_ALIVE_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_KEEP_ALIVE
}

export function setKeepAlive(keepAlive: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(KEEP_ALIVE_COOKIE, keepAlive.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

// Selected owner/repo functions
export function getSelectedOwner(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return Cookies.get(SELECTED_OWNER_COOKIE) || ''
}

export function setSelectedOwner(owner: string): void {
  if (typeof window === 'undefined') return

  if (owner) {
    Cookies.set(SELECTED_OWNER_COOKIE, owner, {
      expires: 365, // 1 year
      sameSite: 'strict',
    })
  } else {
    Cookies.remove(SELECTED_OWNER_COOKIE)
  }
}

export function getSelectedRepo(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return Cookies.get(SELECTED_REPO_COOKIE) || ''
}

export function setSelectedRepo(repo: string): void {
  if (typeof window === 'undefined') return

  if (repo) {
    Cookies.set(SELECTED_REPO_COOKIE, repo, {
      expires: 365, // 1 year
      sameSite: 'strict',
    })
  } else {
    Cookies.remove(SELECTED_REPO_COOKIE)
  }
}

// Pane visibility functions
export function getShowFilesPane(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_SHOW_FILES_PANE
  }

  const cookieValue = Cookies.get(SHOW_FILES_PANE_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_SHOW_FILES_PANE
}

export function setShowFilesPane(show: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(SHOW_FILES_PANE_COOKIE, show.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

export function getShowCodePane(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_SHOW_CODE_PANE
  }

  const cookieValue = Cookies.get(SHOW_CODE_PANE_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_SHOW_CODE_PANE
}

export function setShowCodePane(show: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(SHOW_CODE_PANE_COOKIE, show.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

export function getShowPreviewPane(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_SHOW_PREVIEW_PANE
  }

  const cookieValue = Cookies.get(SHOW_PREVIEW_PANE_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_SHOW_PREVIEW_PANE
}

export function setShowPreviewPane(show: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(SHOW_PREVIEW_PANE_COOKIE, show.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}

export function getShowChatPane(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_SHOW_CHAT_PANE
  }

  const cookieValue = Cookies.get(SHOW_CHAT_PANE_COOKIE)
  if (cookieValue !== undefined) {
    return cookieValue === 'true'
  }

  return DEFAULT_SHOW_CHAT_PANE
}

export function setShowChatPane(show: boolean): void {
  if (typeof window === 'undefined') return

  Cookies.set(SHOW_CHAT_PANE_COOKIE, show.toString(), {
    expires: 365, // 1 year
    sameSite: 'strict',
  })
}
