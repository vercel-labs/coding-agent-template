'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { TaskSidebar } from '@/components/task-sidebar'
import { Task } from '@/lib/db/schema'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getSidebarWidth, setSidebarWidth, getSidebarOpen, setSidebarOpen } from '@/lib/utils/cookies'
import { nanoid } from 'nanoid'

interface AppLayoutProps {
  children: React.ReactNode
  initialSidebarWidth?: number
  initialSidebarOpen?: boolean
}

interface TasksContextType {
  refreshTasks: () => Promise<void>
  toggleSidebar: () => void
  isSidebarOpen: boolean
  addTaskOptimistically: (taskData: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
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
    <div className="h-full border-r bg-muted p-3 overflow-y-auto" style={{ width: `${width}px` }}>
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Loading Tasks...</h2>
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-1.5">
        {/* Loading skeleton for tasks */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-2 h-[68px] flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-4 h-4 bg-muted animate-pulse rounded-full"></div>
              <div className="h-3 bg-muted animate-pulse rounded flex-1"></div>
            </div>
            <div className="h-3 bg-muted animate-pulse rounded ml-6 w-3/4"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AppLayout({ children, initialSidebarWidth, initialSidebarOpen }: AppLayoutProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Always use the server-provided value initially to avoid hydration mismatch
    return initialSidebarOpen ?? false
  })
  const [sidebarWidth, setSidebarWidthState] = useState(initialSidebarWidth || getSidebarWidth())
  const [isResizing, setIsResizing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  const router = useRouter()

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

  // Ensure isDesktop is correct after hydration and set proper sidebar state
  useEffect(() => {
    const newIsDesktop = window.innerWidth >= 1024
    setIsDesktop(newIsDesktop)

    // On mobile, always close sidebar after hydration
    if (!newIsDesktop) {
      setIsSidebarOpen(false)
    } else {
      // On desktop, check if there's a saved preference, otherwise default to open
      const hasCookie = document.cookie.includes('sidebar-open')
      if (hasCookie) {
        const cookieValue = getSidebarOpen()
        setIsSidebarOpen(cookieValue)
      } else {
        // No cookie exists, default to open on desktop
        setIsSidebarOpen(true)
        setSidebarOpen(true) // Save the default preference
      }
    }
  }, [])

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
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
      setIsLoading(false)
    }
  }

  const handleTaskSelect = (task: Task) => {
    router.push(`/tasks/${task.id}`)
    // Close sidebar when navigating on mobile (don't save to cookie)
    if (!isDesktop) {
      updateSidebarOpen(false, false)
    }
  }

  const addTaskOptimistically = (taskData: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
  }) => {
    const id = nanoid()
    const optimisticTask: Task = {
      id,
      prompt: taskData.prompt,
      repoUrl: taskData.repoUrl,
      selectedAgent: taskData.selectedAgent,
      selectedModel: taskData.selectedModel,
      status: 'pending',
      progress: 0,
      logs: [{ type: 'info', message: 'Task created, preparing to start...', timestamp: new Date() }],
      error: null,
      branchName: null,
      sandboxUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
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
    <TasksContext.Provider value={{ refreshTasks: fetchTasks, toggleSidebar, isSidebarOpen, addTaskOptimistically }}>
      <div
        className="h-screen flex relative"
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
            ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}
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
            {isLoading ? (
              <SidebarLoader width={sidebarWidth} />
            ) : (
              <TaskSidebar tasks={tasks} onTaskSelect={handleTaskSelect} width={sidebarWidth} />
            )}
          </div>
        </div>

        {/* Resize Handle - Desktop Only, when sidebar is open */}
        <div
          className={`
            hidden lg:block fixed inset-y-0 cursor-col-resize group z-41 hover:bg-primary/20
            ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}
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
          className={`flex-1 overflow-auto flex flex-col lg:ml-0 ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
          style={{
            marginLeft: isSidebarOpen ? `${sidebarWidth + 4}px` : '0px',
          }}
        >
          {children}
        </div>
      </div>
    </TasksContext.Provider>
  )
}
