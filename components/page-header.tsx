'use client'

import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'

interface PageHeaderProps {
  title?: string
  showMobileMenu?: boolean
  onToggleMobileMenu?: () => void
  actions?: React.ReactNode
  leftActions?: React.ReactNode
  showPlatformName?: boolean
}

export function PageHeader({
  title,
  showMobileMenu = false,
  onToggleMobileMenu,
  actions,
  leftActions,
  showPlatformName = false,
}: PageHeaderProps) {
  return (
    <div className="px-0 pt-0.5 md:pt-3 pb-1.5 md:pb-4 overflow-visible">
      <div className="flex items-center justify-between gap-2 h-8 min-w-0">
        {/* Left side - Menu Button and Left Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          {showMobileMenu && (
            <Button onClick={onToggleMobileMenu} variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
              <Menu className="h-4 w-4" />
            </Button>
          )}
          {leftActions}
        </div>

        {/* Actions - Right side */}
        {actions && <div className="flex items-center flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
