import { TaskPageClient } from '@/components/task-page-client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { MAX_SANDBOX_DURATION } from '@/lib/constants'

interface TaskPageProps {
  params: {
    taskId: string
  }
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { taskId } = await params
  const [session, stars] = await Promise.all([getServerSession(), getGitHubStars()])

  return (
    <TaskPageClient
      taskId={taskId}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
      maxSandboxDuration={MAX_SANDBOX_DURATION}
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
