import { cookies } from 'next/headers'
import { HomePageContent } from '@/components/home-page-content'

export default async function Home() {
  const cookieStore = await cookies()
  const selectedOwner = cookieStore.get('selected-owner')?.value || ''
  const selectedRepo = cookieStore.get('selected-repo')?.value || ''
  const installDependencies = cookieStore.get('install-dependencies')?.value === 'true'
  const maxDuration = parseInt(cookieStore.get('max-duration')?.value || '5', 10)

  return (
    <HomePageContent 
      initialSelectedOwner={selectedOwner}
      initialSelectedRepo={selectedRepo}
      initialInstallDependencies={installDependencies}
      initialMaxDuration={maxDuration}
    />
  )
}
