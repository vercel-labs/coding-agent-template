'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { TaskSidebar } from '@/components/task-sidebar'
import { Task } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { getSidebarWidth, setSidebarWidth, getSidebarOpen, setSidebarOpen } from '@/lib/utils/cookies'
import { nanoid } from 'nanoid'
import { ConnectorsProvider } from '@/components/connectors-provider'

interface AppLayoutProps {
  children: React.ReactNode
  initialSidebarWidth?: number
  initialSidebarOpen?: boolean
  initialIsMobile?: boolean
}

interface TasksContextType {
  refreshTasks: () => Promise<void>
  toggleSidebar: () => void
  isSidebarOpen: boolean
  isSidebarResizing: boolean
  addTaskOptimistically: (taskData: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
  }) => { id: string; optimisticTask: Task }
}

const TasksContext = createContext<TasksContextType | undefined>(undefined)

export const useTasks = () => {
  const context = useContext(TasksContext)
  if (!context) {
    throw new Error('useTasks must be used within AppLayout')
  }
  return context
}

function SidebarLoader({ width }: { width: number }) {
  return (
    <div
      className="h-full border-r bg-muted px-2 md:px-3 pb-3 pt-3 md:pt-5.5 overflow-y-auto"
      style={{ width: `${width}px` }}
    >
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={true} title="Delete Tasks">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="New Task">
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 px-1">
          <button
            className="text-xs font-medium uppercase tracking-wide transition-colors px-2 py-1 rounded text-foreground bg-accent"
            disabled
          >
            Tasks
          </button>
          <button
            className="text-xs font-medium uppercase tracking-wide transition-colors px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
            disabled
          >
            Repos
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {/* Loading skeleton for tasks */}
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse h-[70px] rounded-lg">
            <CardContent className="px-3 py-2">{/* Empty skeleton - just the card shape */}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function AppLayout({ children, initialSidebarWidth, initialSidebarOpen, initialIsMobile }: AppLayoutProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Initialize sidebar state based on user agent and preferences
  // On mobile (from user agent): always closed
  // On desktop: use saved preference or default to open
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (initialIsMobile) return false
    return initialSidebarOpen ?? true
  })
  const [sidebarWidth, setSidebarWidthState] = useState(initialSidebarWidth || getSidebarWidth())
  const [isResizing, setIsResizing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(!initialIsMobile)
  const [hasMounted, setHasMounted] = useState(false)

  // Update sidebar width and save to cookie
  const updateSidebarWidth = (newWidth: number) => {
    setSidebarWidthState(newWidth)
    setSidebarWidth(newWidth)
  }

  // Update sidebar open state and save to cookie (desktop only)
  const updateSidebarOpen = useCallback((isOpen: boolean, saveToCookie = true) => {
    setIsSidebarOpen(isOpen)
    // Only save to cookie on desktop screens
    if (saveToCookie && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSidebarOpen(isOpen)
    }
  }, [])

  // Verify screen size after mount and update if needed
  useEffect(() => {
    const actualIsDesktop = window.innerWidth >= 1024

    // Only update if there's a mismatch between user agent detection and actual screen size
    if (actualIsDesktop !== isDesktop) {
      setIsDesktop(actualIsDesktop)

      if (!actualIsDesktop) {
        // Screen is actually mobile but user agent said desktop
        setIsSidebarOpen(false)
      } else if (actualIsDesktop && initialIsMobile) {
        // Screen is actually desktop but user agent said mobile
        // Use saved preference or default to open
        const savedPreference = getSidebarOpen()
        setIsSidebarOpen(savedPreference ?? initialSidebarOpen ?? true)
      }
    }

    // Mark as mounted to enable transitions
    setHasMounted(true)
  }, [isDesktop, initialIsMobile, initialSidebarOpen])

  // Fetch tasks on component mount
  useEffect(() => {
    fetchTasks()
  }, [])

  // Poll for task updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTasks()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const toggleSidebar = useCallback(() => {
    updateSidebarOpen(!isSidebarOpen)
  }, [isSidebarOpen, updateSidebarOpen])

  // Handle window resize - close sidebar on mobile and update isDesktop
  useEffect(() => {
    const handleResize = () => {
      const newIsDesktop = window.innerWidth >= 1024
      setIsDesktop(newIsDesktop)

      // On mobile, always close sidebar
      if (!newIsDesktop && isSidebarOpen) {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isSidebarOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks')
      if (response.ok) {
        const data = await response.json()
        setTasks(data.tasks)
      } else if (response.status === 401) {
        // User is not authenticated, show empty tasks
        setTasks([])
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addTaskOptimistically = (taskData: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
  }) => {
    const id = nanoid()
    const optimisticTask: Task = {
      id,
      userId: 'temp', // Temporary value, will be replaced by server
      prompt: taskData.prompt,
      title: null,
      repoUrl: taskData.repoUrl,
      selectedAgent: taskData.selectedAgent,
      selectedModel: taskData.selectedModel,
      installDependencies: taskData.installDependencies,
      maxDuration: taskData.maxDuration,
      keepAlive: false,
      status: 'pending',
      progress: 0,
      logs: [],
      error: null,
      branchName: null,
      sandboxId: null,
      agentSessionId: null,
      sandboxUrl: null,
      previewUrl: null,
      mcpServerIds: null,
      prUrl: null,
      prNumber: null,
      prStatus: null,
      prMergeCommitSha: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      deletedAt: null,
    }

    // Add the optimistic task to the beginning of the tasks array
    setTasks((prevTasks) => [optimisticTask, ...prevTasks])

    return { id, optimisticTask }
  }

  const closeSidebar = () => {
    updateSidebarOpen(false, false) // Don't save to cookie for mobile backdrop clicks
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      const minWidth = 200
      const maxWidth = 600

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        updateSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  return (
    <TasksContext.Provider
      value={{
        refreshTasks: fetchTasks,
        toggleSidebar,
        isSidebarOpen,
        isSidebarResizing: isResizing,
        addTaskOptimistically,
      }}
    >
      <ConnectorsProvider>
        <div
          className="h-dvh flex relative"
          style={
            {
              '--sidebar-width': `${sidebarWidth}px`,
              '--sidebar-open': isSidebarOpen ? '1' : '0',
            } as React.CSSProperties
          }
          suppressHydrationWarning
        >
          {/* Backdrop - Mobile Only */}
          {isSidebarOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={closeSidebar} />}

          {/* Sidebar */}
          <div
            className={`
            fixed inset-y-0 left-0 z-40
            ${isResizing || !hasMounted ? '' : 'transition-all duration-300 ease-in-out'}
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            ${isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}
          `}
            style={{
              width: `${sidebarWidth}px`,
            }}
          >
            <div
              className="h-full overflow-hidden"
              style={{
                width: `${sidebarWidth}px`,
              }}
            >
              {isLoading ? <SidebarLoader width={sidebarWidth} /> : <TaskSidebar tasks={tasks} width={sidebarWidth} />}
            </div>
          </div>

          {/* Resize Handle - Desktop Only, when sidebar is open */}
          <div
            className={`
            hidden lg:block fixed inset-y-0 cursor-col-resize group z-50 hover:bg-primary/20
            ${isResizing || !hasMounted ? '' : 'transition-all duration-300 ease-in-out'}
            ${isSidebarOpen ? 'w-1 opacity-100' : 'w-0 opacity-0'}
          `}
            onMouseDown={isSidebarOpen ? handleMouseDown : undefined}
            style={{
              // Position it right after the sidebar
              left: isSidebarOpen ? `${sidebarWidth}px` : '0px',
            }}
          >
            <div className="absolute inset-0 w-2 -ml-0.5" />
            <div className="absolute inset-y-0 left-0 w-0.5 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Main Content */}
          <div
            className={`flex-1 overflow-auto flex flex-col ${isResizing || !hasMounted ? '' : 'transition-all duration-300 ease-in-out'}`}
            style={{
              marginLeft: isDesktop && isSidebarOpen ? `${sidebarWidth + 4}px` : '0px',
            }}
          >
            {children}
          </div>
        </div>
      </ConnectorsProvider>
    </TasksContext.Provider>
  )
}
