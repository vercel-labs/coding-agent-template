import { TaskPageClient } from '@/components/task-page-client'

interface TaskPageProps {
  params: {
    taskId: string
  }
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { taskId } = await params

  return <TaskPageClient taskId={taskId} />
}

export async function generateMetadata({ params }: TaskPageProps) {
  const { taskId } = await params

  return {
    title: `Task - Coding Agent Platform`,
    description: 'View task details and execution logs',
  }
}
