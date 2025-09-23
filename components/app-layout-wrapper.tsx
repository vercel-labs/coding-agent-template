import { cookies } from 'next/headers'
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

  return (
    <AppLayout initialSidebarWidth={initialSidebarWidth} initialSidebarOpen={initialSidebarOpen}>
      {children}
    </AppLayout>
  )
}
