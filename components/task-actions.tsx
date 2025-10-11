'use client'

import { Button } from '@/components/ui/button'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'

interface TaskActionsProps {
  task: unknown
}

export function TaskActions({}: TaskActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Deploy to Vercel Button */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
      >
        <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
          Deploy to Vercel
        </a>
      </Button>
    </div>
  )
}
