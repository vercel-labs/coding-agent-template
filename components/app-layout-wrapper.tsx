import { cookies, headers } from 'next/headers'
import { AppLayout } from './app-layout'
import { getSidebarWidthFromCookie, getSidebarOpenFromCookie } from '@/lib/utils/cookies'

interface AppLayoutWrapperProps {
  children: React.ReactNode
}

export async function AppLayoutWrapper({ children }: AppLayoutWrapperProps) {
  const cookieStore = await cookies()
  const cookieString = cookieStore.toString()
  const initialSidebarWidth = getSidebarWidthFromCookie(cookieString)
  const initialSidebarOpen = getSidebarOpenFromCookie(cookieString)

  // Detect if mobile from user agent
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || ''
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

  return (
    <AppLayout
      initialSidebarWidth={initialSidebarWidth}
      initialSidebarOpen={initialSidebarOpen}
      initialIsMobile={isMobile}
    >
      {children}
    </AppLayout>
  )
}
