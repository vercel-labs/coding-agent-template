import { RepoPageClient } from '@/components/repo-page-client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'

interface RepoPageProps {
  params: {
    owner: string
    repo: string
  }
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { owner, repo } = await params
  const session = await getServerSession()
  const stars = await getGitHubStars()

  return (
    <RepoPageClient
      owner={owner}
      repo={repo}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
    />
  )
}

export async function generateMetadata({ params }: RepoPageProps) {
  const { owner, repo } = await params

  return {
    title: `${owner}/${repo} - Coding Agent Platform`,
    description: 'View repository commits and pull requests',
  }
}
