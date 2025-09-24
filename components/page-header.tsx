'use client'

import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'

interface PageHeaderProps {
  title?: string
  showMobileMenu?: boolean
  onToggleMobileMenu?: () => void
  isMobileSidebarOpen?: boolean
  actions?: React.ReactNode
}

export function PageHeader({
  title,
  showMobileMenu = false,
  onToggleMobileMenu,
  isMobileSidebarOpen = false,
  actions,
}: PageHeaderProps) {
  return (
    <div className="relative p-3">
      {/* Menu Button - Absolute positioned in top-left */}
      {showMobileMenu && (
        <Button
          onClick={onToggleMobileMenu}
          variant="ghost"
          size="sm"
          className="absolute top-0 left-0 h-8 w-8 p-0 z-10"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}

      {/* Actions - Absolute positioned in top-right */}
      {actions && <div className="absolute top-0 right-0 z-10">{actions}</div>}

      {/* Title - Centered with padding for buttons */}
      <div className="px-12 text-center mb-4">{title && <h1 className="text-3xl font-bold mb-2">{title}</h1>}</div>
    </div>
  )
}
