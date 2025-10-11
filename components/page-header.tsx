'use client'

import { Button } from '@/components/ui/button'
import { Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

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
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative px-3 pt-3">
      {/* Left side - Menu Button and Left Actions */}
      <div className="absolute top-0 left-0 z-10 flex items-center gap-2">
        {showMobileMenu && (
          <>
            <Button onClick={onToggleMobileMenu} variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Menu className="h-4 w-4" />
            </Button>
            {showPlatformName && (
              <span className="text-sm font-semibold text-muted-foreground">Coding Agent Template</span>
            )}
          </>
        )}
        {leftActions}
      </div>

      {/* Actions - Absolute positioned in top-right */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        {mounted && (
          <Button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
        {actions}
      </div>

      {/* Title - Centered with padding for buttons */}
      <div className="px-12 text-center mb-4">{title && <h1 className="text-3xl font-bold mb-2">{title}</h1>}</div>
    </div>
  )
}
