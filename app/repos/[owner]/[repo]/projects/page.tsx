import { RepoProjects } from '@/components/repo-projects'

interface ProjectsPageProps {
  params: {
    owner: string
    repo: string
  }
}

export default async function ProjectsPage({ params }: ProjectsPageProps) {
  const { owner, repo } = await params

  return <RepoProjects owner={owner} repo={repo} />
}
