import { RepoPullRequests } from '@/components/repo-pull-requests'

interface PullRequestsPageProps {
  params: {
    owner: string
    repo: string
  }
}

export default async function PullRequestsPage({ params }: PullRequestsPageProps) {
  const { owner, repo } = await params

  return <RepoPullRequests owner={owner} repo={repo} />
}
