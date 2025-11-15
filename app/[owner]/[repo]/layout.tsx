import { Metadata } from 'next'

interface LayoutProps {
  params: Promise<{
    owner: string
    repo: string
  }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { owner, repo } = await params

  return {
    title: `${owner}/${repo} - Coding Agent`,
    description: `Create AI-powered tasks for ${owner}/${repo}`,
  }
}

export default function Layout({ children }: LayoutProps) {
  return children
}
