import { RepoCommits } from '@/components/repo-commits'

interface CommitsPageProps {
  params: {
    owner: string
    repo: string
  }
}

export default async function CommitsPage({ params }: CommitsPageProps) {
  const { owner, repo } = await params

  return <RepoCommits owner={owner} repo={repo} />
}
