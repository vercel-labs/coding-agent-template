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
    <div className="relative px-3 pt-3">
      {/* Left side - Menu Button and Left Actions */}
      <div className="absolute top-0 left-0 z-10 flex items-center gap-2 h-8">
        {showMobileMenu && (
          <Button onClick={onToggleMobileMenu} variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
            <Menu className="h-4 w-4" />
          </Button>
        )}
        {leftActions}
      </div>

      {/* Actions - Absolute positioned in top-right */}
      {actions && <div className="absolute top-0 right-0 z-10 h-8">{actions}</div>}

      {/* Spacer to prevent content overlap - reserves space for absolutely positioned elements */}
      <div className="h-8 mb-4" />
    </div>
  )
}
