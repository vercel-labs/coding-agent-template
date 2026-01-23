'use client'

import { SharedHeader } from '@/components/shared-header'
import { Loader2 } from 'lucide-react'

export default function TaskLoading() {
  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <SharedHeader />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading task...</p>
        </div>
      </div>
    </div>
  )
}
