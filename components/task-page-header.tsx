'use client'

import { Task } from '@/lib/db/schema'
import { PageHeader } from '@/components/page-header'
import { TaskActions } from '@/components/task-actions'
import { useTasks } from '@/components/app-layout'
import { User } from '@/components/auth/user'

interface TaskPageHeaderProps {
  task: Task
}

export function TaskPageHeader({ task }: TaskPageHeaderProps) {
  const { toggleSidebar } = useTasks()

  return (
    <PageHeader
      showMobileMenu={true}
      onToggleMobileMenu={toggleSidebar}
      showPlatformName={true}
      actions={
        <div className="flex items-center gap-2">
          <TaskActions task={task} />
          <User />
        </div>
      }
    />
  )
}
