import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { TasksListClient } from '@/components/tasks-list-client'
import { redirect } from 'next/navigation'

export default async function TasksListPage() {
  // Fetch session and stars in parallel for better performance
  const sessionPromise = getServerSession()
  const starsPromise = getGitHubStars()
  const session = await sessionPromise

  // Redirect to home if not authenticated
  if (!session?.user) {
    redirect('/')
  }

  const stars = await starsPromise

  return <TasksListClient user={session.user} authProvider={session.authProvider} initialStars={stars} />
}
