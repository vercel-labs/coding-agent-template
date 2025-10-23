import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { TasksListClient } from '@/components/tasks-list-client'
import { redirect } from 'next/navigation'

export default async function TasksListPage() {
  const session = await getServerSession()
  const stars = await getGitHubStars()

  // Redirect to home if not authenticated
  if (!session?.user) {
    redirect('/')
  }

  return <TasksListClient user={session.user} authProvider={session.authProvider} initialStars={stars} />
}
