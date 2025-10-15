import { TaskPageClient } from '@/components/task-page-client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { getMaxSandboxDuration } from '@/lib/db/settings'

interface TaskPageProps {
  params: {
    taskId: string
  }
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { taskId } = await params
  const session = await getServerSession()

  // Get max sandbox duration for this user (user-specific > global > env var)
  const maxSandboxDuration = await getMaxSandboxDuration(session?.user?.id)

  const stars = await getGitHubStars()

  return (
    <TaskPageClient
      taskId={taskId}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
      maxSandboxDuration={maxSandboxDuration}
    />
  )
}

export async function generateMetadata({ params }: TaskPageProps) {
  const { taskId } = await params

  return {
    title: `Task ${taskId} - Coding Agent Platform`,
    description: 'View task details and execution logs',
  }
}
