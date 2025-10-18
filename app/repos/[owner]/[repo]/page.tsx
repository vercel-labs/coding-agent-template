import { redirect } from 'next/navigation'

interface RepoPageProps {
  params: {
    owner: string
    repo: string
  }
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { owner, repo } = await params

  // Redirect to commits by default
  redirect(`/repos/${owner}/${repo}/commits`)
}
