import { RepoLayout } from '@/components/repo-layout'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'

interface RepoLayoutProps {
  params: {
    owner: string
    repo: string
  }
  children: React.ReactNode
}

export default async function Layout({ params, children }: RepoLayoutProps) {
  const { owner, repo } = await params
  const session = await getServerSession()
  const stars = await getGitHubStars()

  return (
    <RepoLayout
      owner={owner}
      repo={repo}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
    >
      {children}
    </RepoLayout>
  )
}

export async function generateMetadata({ params }: Pick<RepoLayoutProps, 'params'>) {
  const { owner, repo } = await params

  return {
    title: `${owner}/${repo} - Coding Agent Platform`,
    description: 'View repository commits, issues, and pull requests',
  }
}
