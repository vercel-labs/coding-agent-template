import { RepoIssues } from '@/components/repo-issues'

interface IssuesPageProps {
  params: {
    owner: string
    repo: string
  }
}

export default async function IssuesPage({ params }: IssuesPageProps) {
  const { owner, repo } = await params

  return <RepoIssues owner={owner} repo={repo} />
}
