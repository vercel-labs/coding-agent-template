import { cookies } from 'next/headers'
import { HomePageContent } from '@/components/home-page-content'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { getMaxSandboxDuration } from '@/lib/db/settings'

interface OwnerRepoPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export default async function OwnerRepoPage({ params }: OwnerRepoPageProps) {
  const { owner, repo } = await params

  const cookieStore = await cookies()
  const installDependencies = cookieStore.get('install-dependencies')?.value === 'true'
  const keepAlive = cookieStore.get('keep-alive')?.value === 'true'

  const session = await getServerSession()

  // Get max sandbox duration for this user (user-specific > global > env var)
  const maxSandboxDuration = await getMaxSandboxDuration(session?.user?.id)
  const maxDuration = parseInt(cookieStore.get('max-duration')?.value || maxSandboxDuration.toString(), 10)

  const stars = await getGitHubStars()

  return (
    <HomePageContent
      initialSelectedOwner={owner}
      initialSelectedRepo={repo}
      initialInstallDependencies={installDependencies}
      initialMaxDuration={maxDuration}
      initialKeepAlive={keepAlive}
      maxSandboxDuration={maxSandboxDuration}
      user={session?.user ?? null}
      initialStars={stars}
    />
  )
}
