'use client'

import { TaskMessage, Task } from '@/lib/db/schema'
import { useState, useEffect, useRef, useCallback, Children, isValidElement } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowUp,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  Square,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  MoreVertical,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { Streamdown } from 'streamdown'
import { useAtom } from 'jotai'
import { taskChatInputAtomFamily } from '@/lib/atoms/task'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface TaskChatProps {
  taskId: string
  task: Task
}

interface PRComment {
  id: number
  user: {
    login: string
    avatar_url: string
  }
  body: string
  created_at: string
  html_url: string
}

interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string
  completed_at: string | null
}

interface DeploymentInfo {
  hasDeployment: boolean
  previewUrl?: string
  message?: string
  createdAt?: string
}

export function TaskChat({ taskId, task }: TaskChatProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useAtom(taskChatInputAtomFamily(taskId))
  const [isSending, setIsSending] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)
  const previousMessagesHashRef = useRef('')
  const wasAtBottomRef = useRef(true)
  const [activeTab, setActiveTab] = useState<'chat' | 'comments' | 'actions' | 'deployments'>('chat')
  const [prComments, setPrComments] = useState<PRComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [checkRuns, setCheckRuns] = useState<CheckRun[]>([])
  const [loadingActions, setLoadingActions] = useState(false)
  const [actionsError, setActionsError] = useState<string | null>(null)
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null)
  const [loadingDeployment, setLoadingDeployment] = useState(false)
  const [deploymentError, setDeploymentError] = useState<string | null>(null)
  const [userMessageHeights, setUserMessageHeights] = useState<Record<string, number>>({})
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [overflowingMessages, setOverflowingMessages] = useState<Set<string>>(new Set())
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Track if each tab has been loaded to avoid refetching on tab switch
  const commentsLoadedRef = useRef(false)
  const actionsLoadedRef = useRef(false)
  const deploymentLoadedRef = useRef(false)

  const isNearBottom = () => {
    const container = scrollContainerRef.current
    if (!container) return true // Default to true if no container

    const threshold = 100 // pixels from bottom
    const position = container.scrollTop + container.clientHeight
    const bottom = container.scrollHeight

    return position >= bottom - threshold
  }

  const scrollToBottom = () => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }

  const fetchMessages = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/messages`)
        const data = await response.json()

        if (response.ok && data.success) {
          setMessages(data.messages)
        } else {
          setError(data.error || 'Failed to fetch messages')
        }
      } catch (err) {
        console.error('Error fetching messages:', err)
        setError('Failed to fetch messages')
      } finally {
        if (showLoading) {
          setIsLoading(false)
        }
      }
    },
    [taskId],
  )

  const fetchPRComments = useCallback(
    async (showLoading = true) => {
      if (!task.prNumber || !task.repoUrl) return

      // Don't refetch if already loaded
      if (commentsLoadedRef.current && showLoading) return

      if (showLoading) {
        setLoadingComments(true)
      }
      setCommentsError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/pr-comments`)
        const data = await response.json()

        if (response.ok && data.success) {
          setPrComments(data.comments || [])
          commentsLoadedRef.current = true
        } else {
          setCommentsError(data.error || 'Failed to fetch comments')
        }
      } catch (err) {
        console.error('Error fetching PR comments:', err)
        setCommentsError('Failed to fetch comments')
      } finally {
        if (showLoading) {
          setLoadingComments(false)
        }
      }
    },
    [taskId, task.prNumber, task.repoUrl],
  )

  const fetchCheckRuns = useCallback(
    async (showLoading = true) => {
      if (!task.branchName || !task.repoUrl) return

      // Don't refetch if already loaded
      if (actionsLoadedRef.current && showLoading) return

      if (showLoading) {
        setLoadingActions(true)
      }
      setActionsError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/check-runs`)
        const data = await response.json()

        if (response.ok && data.success) {
          setCheckRuns(data.checkRuns || [])
          actionsLoadedRef.current = true
        } else {
          setActionsError(data.error || 'Failed to fetch check runs')
        }
      } catch (err) {
        console.error('Error fetching check runs:', err)
        setActionsError('Failed to fetch check runs')
      } finally {
        if (showLoading) {
          setLoadingActions(false)
        }
      }
    },
    [taskId, task.branchName, task.repoUrl],
  )

  const fetchDeployment = useCallback(
    async (showLoading = true) => {
      // Don't refetch if already loaded
      if (deploymentLoadedRef.current && showLoading) return

      if (showLoading) {
        setLoadingDeployment(true)
      }
      setDeploymentError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/deployment`)
        const data = await response.json()

        if (response.ok && data.success) {
          setDeployment(data.data)
          deploymentLoadedRef.current = true
        } else {
          setDeploymentError(data.error || 'Failed to fetch deployment')
        }
      } catch (err) {
        console.error('Error fetching deployment:', err)
        setDeploymentError('Failed to fetch deployment')
      } finally {
        if (showLoading) {
          setLoadingDeployment(false)
        }
      }
    },
    [taskId],
  )

  const handleRefresh = useCallback(() => {
    switch (activeTab) {
      case 'chat':
        fetchMessages(false)
        break
      case 'comments':
        if (task.prNumber) {
          commentsLoadedRef.current = false
          fetchPRComments()
        }
        break
      case 'actions':
        if (task.branchName) {
          actionsLoadedRef.current = false
          fetchCheckRuns()
        }
        break
      case 'deployments':
        deploymentLoadedRef.current = false
        fetchDeployment()
        break
    }
  }, [activeTab, task.prNumber, task.branchName, fetchMessages, fetchPRComments, fetchCheckRuns, fetchDeployment])

  useEffect(() => {
    fetchMessages(true) // Show loading on initial fetch

    // Poll for new messages every 3 seconds without showing loading state
    const interval = setInterval(() => {
      fetchMessages(false) // Don't show loading on polls
    }, 3000)

    return () => clearInterval(interval)
  }, [fetchMessages])

  // Auto-refresh for active tab (Comments, Checks, Deployments)
  useEffect(() => {
    if (activeTab === 'chat') return // Chat already has its own refresh

    const refreshInterval = 30000 // 30 seconds

    const interval = setInterval(() => {
      switch (activeTab) {
        case 'comments':
          if (task.prNumber) {
            commentsLoadedRef.current = false
            fetchPRComments(false) // Don't show loading on auto-refresh
          }
          break
        case 'actions':
          if (task.branchName) {
            actionsLoadedRef.current = false
            fetchCheckRuns(false) // Don't show loading on auto-refresh
          }
          break
        case 'deployments':
          deploymentLoadedRef.current = false
          fetchDeployment(false) // Don't show loading on auto-refresh
          break
      }
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [activeTab, task.prNumber, task.branchName, fetchPRComments, fetchCheckRuns, fetchDeployment])

  // Reset cache and refetch when PR number changes (PR created/updated)
  useEffect(() => {
    if (task.prNumber) {
      commentsLoadedRef.current = false
      if (activeTab === 'comments') {
        fetchPRComments()
      }
    }
  }, [task.prNumber, activeTab, fetchPRComments])

  // Reset cache and refetch when branch name changes (branch created)
  useEffect(() => {
    if (task.branchName) {
      actionsLoadedRef.current = false
      if (activeTab === 'actions') {
        fetchCheckRuns()
      }
    }
  }, [task.branchName, activeTab, fetchCheckRuns])

  // Fetch PR comments when tab switches to comments
  useEffect(() => {
    if (activeTab === 'comments' && task.prNumber) {
      fetchPRComments()
    }
  }, [activeTab, task.prNumber, fetchPRComments])

  // Fetch check runs when tab switches to actions
  useEffect(() => {
    if (activeTab === 'actions' && task.branchName) {
      fetchCheckRuns()
    }
  }, [activeTab, task.branchName, fetchCheckRuns])

  // Fetch deployment when tab switches to deployments
  useEffect(() => {
    if (activeTab === 'deployments') {
      fetchDeployment()
    }
  }, [activeTab, fetchDeployment])

  // Track scroll position to maintain scroll at bottom when content updates
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      wasAtBottomRef.current = isNearBottom()
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Calculate heights for user messages to create proper sticky stacking
  useEffect(() => {
    const displayMessages = messages.slice(-10)
    const userMessages = displayMessages.filter((m) => m.role === 'user')

    if (userMessages.length === 0) return

    const measureHeights = () => {
      const newHeights: Record<string, number> = {}
      const newOverflowing = new Set<string>()

      userMessages.forEach((message) => {
        const el = messageRefs.current[message.id]
        const contentEl = contentRefs.current[message.id]

        if (el) {
          newHeights[message.id] = el.offsetHeight
        }

        // Check if content is overflowing the max-height (72px ~ 4 lines)
        if (contentEl && contentEl.scrollHeight > 72) {
          newOverflowing.add(message.id)
        }
      })

      setUserMessageHeights(newHeights)
      setOverflowingMessages(newOverflowing)
    }

    // Measure after render
    setTimeout(measureHeights, 0)

    // Remeasure on window resize
    window.addEventListener('resize', measureHeights)
    return () => window.removeEventListener('resize', measureHeights)
  }, [messages])

  // Auto-scroll when messages change if user was at bottom
  useEffect(() => {
    const currentMessageCount = messages.length
    const previousMessageCount = previousMessageCountRef.current

    // Create a hash of current messages to detect actual content changes
    const currentHash = messages.map((m) => `${m.id}:${m.content.length}`).join('|')
    const previousHash = previousMessagesHashRef.current

    // Only proceed if content actually changed
    const contentChanged = currentHash !== previousHash

    // Always scroll on initial load
    if (previousMessageCount === 0 && currentMessageCount > 0) {
      setTimeout(() => scrollToBottom(), 0)
      wasAtBottomRef.current = true
      previousMessageCountRef.current = currentMessageCount
      previousMessagesHashRef.current = currentHash
      return
    }

    // Only scroll if content changed AND user was at bottom
    if (contentChanged && wasAtBottomRef.current) {
      // Use setTimeout to ensure DOM has updated with new content
      setTimeout(() => {
        if (wasAtBottomRef.current) {
          scrollToBottom()
        }
      }, 50)
    }

    previousMessageCountRef.current = currentMessageCount
    previousMessagesHashRef.current = currentHash
  }, [messages])

  // Timer for duration display
  useEffect(() => {
    if (task.status === 'processing' || task.status === 'pending') {
      const interval = setInterval(() => {
        setCurrentTime(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [task.status])

  const formatDuration = (messageCreatedAt: Date) => {
    const startTime = new Date(messageCreatedAt).getTime()

    // Find the next agent message after this user message
    const messageIndex = messages.findIndex((m) => new Date(m.createdAt).getTime() === startTime)
    const nextAgentMessage = messages.slice(messageIndex + 1).find((m) => m.role === 'agent')

    const endTime = nextAgentMessage
      ? new Date(nextAgentMessage.createdAt).getTime()
      : task.completedAt
        ? new Date(task.completedAt).getTime()
        : currentTime

    const durationMs = Math.max(0, endTime - startTime) // Ensure non-negative
    const durationSeconds = Math.floor(durationMs / 1000)

    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return

    setIsSending(true)
    const messageToSend = newMessage.trim()

    // Clear the message immediately (optimistic)
    setNewMessage('')

    try {
      const response = await fetch(`/api/tasks/${taskId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageToSend,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh messages to show the new user message without loading state
        await fetchMessages(false)
        // Message was sent successfully, keep it cleared
      } else {
        toast.error(data.error || 'Failed to send message')
        setNewMessage(messageToSend) // Restore the message on error
      }
    } catch (err) {
      console.error('Error sending message:', err)
      toast.error('Failed to send message')
      setNewMessage(messageToSend) // Restore the message on error
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('Failed to copy message:', err)
      toast.error('Failed to copy message')
    }
  }

  const handleRetryMessage = async (content: string) => {
    if (isSending) return

    setIsSending(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh messages to show the new user message without loading state
        await fetchMessages(false)
      } else {
        toast.error(data.error || 'Failed to resend message')
      }
    } catch (err) {
      console.error('Error resending message:', err)
      toast.error('Failed to resend message')
    } finally {
      setIsSending(false)
    }
  }

  const handleStopTask = async () => {
    setIsStopping(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'stop' }),
      })

      if (response.ok) {
        toast.success('Task stopped successfully!')
        // Task will update through polling
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to stop task')
      }
    } catch (error) {
      console.error('Error stopping task:', error)
      toast.error('Failed to stop task')
    } finally {
      setIsStopping(false)
    }
  }

  const parseAgentMessage = (content: string): string => {
    try {
      const parsed = JSON.parse(content)
      // Check if it's a Cursor agent response with a result field
      if (parsed && typeof parsed === 'object' && 'result' in parsed && typeof parsed.result === 'string') {
        return parsed.result
      }
      return content
    } catch {
      // Not valid JSON, return as-is
      return content
    }
  }

  const handleSendCommentAsFollowUp = (comment: PRComment) => {
    // Format the message to indicate it came from a PR comment
    const formattedMessage = `**PR Comment from @${comment.user.login}:**\n\n${comment.body}\n\n---\n\nPlease address the above PR comment and make the necessary changes to ensure the feedback is accurately addressed.`

    // Set the message in the chat input
    setNewMessage(formattedMessage)

    // Switch to chat tab
    setActiveTab('chat')

    // Show success toast
    toast.success('Comment added to chat input')
  }

  // Use a non-narrowed variable for tab button comparisons
  const currentTab = activeTab as string

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-2 text-xs md:text-sm">{error}</p>
        </div>
      </div>
    )
  }

  // Render tab content
  const renderTabContent = () => {
    if (activeTab === 'deployments') {
      return (
        <div className="flex-1 overflow-y-auto pb-4">
          {loadingDeployment ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : deploymentError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-destructive mb-2 text-xs md:text-sm">{deploymentError}</p>
              </div>
            </div>
          ) : !deployment?.hasDeployment ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
              <div className="text-sm md:text-base">{deployment?.message || 'No deployment found'}</div>
            </div>
          ) : (
            <div className="space-y-2 px-2">
              <a
                href={deployment.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 76 65" fill="currentColor">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">Vercel Preview</div>
                  <div className="text-xs text-muted-foreground">
                    {deployment.createdAt
                      ? `Deployed ${new Date(deployment.createdAt).toLocaleString()}`
                      : 'Preview deployment'}
                  </div>
                </div>
              </a>
            </div>
          )}
        </div>
      )
    }

    if (activeTab === 'actions') {
      const getStatusIcon = (status: string, conclusion: string | null) => {
        if (status === 'completed') {
          if (conclusion === 'success') {
            return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
          } else if (conclusion === 'failure') {
            return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          } else if (conclusion === 'cancelled') {
            return <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          }
        } else if (status === 'in_progress') {
          return <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
        }
        return <Square className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      }

      return (
        <div className="flex-1 overflow-y-auto pb-4">
          {!task.branchName ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
              <div className="text-sm md:text-base">
                No branch yet. GitHub Checks will appear here once a branch is created.
              </div>
            </div>
          ) : loadingActions ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : actionsError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-destructive mb-2 text-xs md:text-sm">{actionsError}</p>
              </div>
            </div>
          ) : checkRuns.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <div className="text-sm md:text-base">No checks running</div>
            </div>
          ) : (
            <div className="space-y-2 px-2">
              {checkRuns.map((check) => (
                <a
                  key={check.id}
                  href={check.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  {getStatusIcon(check.status, check.conclusion)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{check.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {check.status === 'completed' && check.completed_at
                        ? `Completed ${new Date(check.completed_at).toLocaleString()}`
                        : check.status === 'in_progress'
                          ? 'In progress...'
                          : 'Queued'}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (activeTab === 'comments') {
      return (
        <div className="flex-1 overflow-y-auto pb-4">
          {!task.prNumber ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
              <div className="text-sm md:text-base">No pull request yet. Create a PR to see comments here.</div>
            </div>
          ) : loadingComments ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : commentsError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-destructive mb-2 text-xs md:text-sm">{commentsError}</p>
              </div>
            </div>
          ) : prComments.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <div className="text-sm md:text-base">No comments yet</div>
            </div>
          ) : (
            <div className="space-y-4">
              {prComments.map((comment) => (
                <div key={comment.id} className="px-2">
                  <div className="flex items-start gap-2 mb-2">
                    <img
                      src={comment.user.avatar_url}
                      alt={comment.user.login}
                      className="w-6 h-6 rounded-full flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">{comment.user.login}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-foreground">
                        <Streamdown
                          components={{
                            code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
                              <code className={`${className} !text-xs`} {...props}>
                                {children}
                              </code>
                            ),
                            pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
                              <pre className="!text-xs" {...props}>
                                {children}
                              </pre>
                            ),
                            p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
                              <p className="text-xs" {...props}>
                                {children}
                              </p>
                            ),
                            a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<'a'>) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                {...props}
                              >
                                {children}
                              </a>
                            ),
                            ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
                              <ul className="text-xs list-disc ml-4" {...props}>
                                {children}
                              </ul>
                            ),
                            ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
                              <ol className="text-xs list-decimal ml-4" {...props}>
                                {children}
                              </ol>
                            ),
                            li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
                              <li className="text-xs mb-2" {...props}>
                                {Children.toArray(children).filter((c) => typeof c === 'string' || isValidElement(c))}
                              </li>
                            ),
                          }}
                        >
                          {comment.body}
                        </Streamdown>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleSendCommentAsFollowUp(comment)}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send as Follow-Up
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Chat tab (default)
    if (messages.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div className="text-sm md:text-base">No messages yet</div>
        </div>
      )
    }

    const displayMessages = messages.slice(-10)
    const hiddenMessagesCount = messages.length - displayMessages.length

    // Group messages by user message boundaries and calculate min-heights
    const messageGroups: { userMessage: TaskMessage; agentMessages: TaskMessage[]; minHeight: number }[] = []

    displayMessages.forEach((message) => {
      if (message.role === 'user') {
        messageGroups.push({ userMessage: message, agentMessages: [], minHeight: 0 })
      } else if (messageGroups.length > 0) {
        messageGroups[messageGroups.length - 1].agentMessages.push(message)
      }
    })

    // Calculate min-height for each group based on subsequent user messages
    messageGroups.forEach((group, groupIndex) => {
      let minHeight = 0
      for (let i = groupIndex + 1; i < messageGroups.length; i++) {
        const height = userMessageHeights[messageGroups[i].userMessage.id]
        if (height !== undefined) {
          minHeight += height + 16 // 16px for mt-4 margin
        }
      }
      group.minHeight = minHeight
    })

    return (
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
        {hiddenMessagesCount > 0 && (
          <div className="text-xs text-center text-muted-foreground opacity-50 mb-4 italic">
            {hiddenMessagesCount} older message{hiddenMessagesCount !== 1 ? 's' : ''} hidden
          </div>
        )}
        {messageGroups.map((group, groupIndex) => {
          return (
            <div
              key={group.userMessage.id}
              className="flex flex-col"
              style={group.minHeight > 0 ? { minHeight: `${group.minHeight}px` } : undefined}
            >
              <div
                ref={(el) => {
                  messageRefs.current[group.userMessage.id] = el
                }}
                className={`${groupIndex > 0 ? 'mt-4' : ''} sticky top-0 z-10 before:content-[""] before:absolute before:inset-0 before:bg-background before:-z-10`}
              >
                <Card className="px-2 py-2 bg-card rounded-md relative z-10 gap-0.5">
                  <div
                    ref={(el) => {
                      contentRefs.current[group.userMessage.id] = el
                    }}
                    className="relative max-h-[72px] overflow-hidden"
                  >
                    <div className="text-xs">
                      <Streamdown
                        components={{
                          code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
                            <code className={`${className} !text-xs`} {...props}>
                              {children}
                            </code>
                          ),
                          pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
                            <pre className="!text-xs" {...props}>
                              {children}
                            </pre>
                          ),
                          p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
                            <p className="text-xs" {...props}>
                              {children}
                            </p>
                          ),
                          ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
                            <ul className="text-xs list-disc ml-4" {...props}>
                              {children}
                            </ul>
                          ),
                          ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
                            <ol className="text-xs list-decimal ml-4" {...props}>
                              {children}
                            </ol>
                          ),
                          li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
                            <li className="text-xs mb-2" {...props}>
                              {Children.toArray(children).filter((c) => typeof c === 'string' || isValidElement(c))}
                            </li>
                          ),
                        }}
                      >
                        {group.userMessage.content}
                      </Streamdown>
                    </div>
                    {overflowingMessages.has(group.userMessage.id) && (
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 justify-end">
                    <button
                      onClick={() => handleRetryMessage(group.userMessage.content)}
                      disabled={isSending}
                      className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center disabled:opacity-20"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleCopyMessage(group.userMessage.id, group.userMessage.content)}
                      className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center"
                    >
                      {copiedMessageId === group.userMessage.id ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </Card>
              </div>

              {/* Render agent messages in this group */}
              {group.agentMessages.map((agentMessage) => (
                <div key={agentMessage.id} className="mt-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground px-2">
                      {!agentMessage.content.trim() && (task.status === 'processing' || task.status === 'pending')
                        ? (() => {
                            return (
                              <div className="opacity-50">
                                <div className="italic">Generating response...</div>
                                <div className="text-right font-mono opacity-70 mt-1">
                                  {formatDuration(group.userMessage.createdAt)}
                                </div>
                              </div>
                            )
                          })()
                        : (() => {
                            // Determine if this is the last agent message
                            const allAgentMessages = displayMessages.filter((m) => m.role === 'agent')
                            const isLastAgentMessage =
                              allAgentMessages.length > 0 &&
                              allAgentMessages[allAgentMessages.length - 1].id === agentMessage.id

                            const isAgentWorking = task.status === 'processing' || task.status === 'pending'
                            const content = parseAgentMessage(agentMessage.content)

                            // Pre-process content to mark the last tool call with a special marker
                            let processedContent = content
                            if (isAgentWorking && isLastAgentMessage) {
                              // Find all tool calls (more comprehensive pattern)
                              const toolCallRegex = /\n\n([A-Z][a-z]+(?:\s+[a-z]+)*:?\s+[^\n]+)/g
                              const matches = Array.from(content.matchAll(toolCallRegex))

                              // Filter to only actual tool calls
                              const toolCallMatches = matches.filter((match) => {
                                const text = match[1]
                                return /^(?:Editing|Reading|Running|Listing|Executing|Searching|Finding|Grep)/i.test(
                                  text,
                                )
                              })

                              if (toolCallMatches.length > 0) {
                                // Get the last match
                                const lastMatch = toolCallMatches[toolCallMatches.length - 1]
                                const lastToolCall = lastMatch[1]
                                const lastIndex = lastMatch.index! + 2 // +2 for \n\n
                                const endOfToolCall = lastIndex + lastToolCall.length

                                // Check if there's any non-whitespace content after the last tool call
                                const contentAfter = content.substring(endOfToolCall).trim()

                                // Only add the shimmer marker if there's no content after it
                                if (!contentAfter) {
                                  processedContent =
                                    content.substring(0, lastIndex) +
                                    '🔄SHIMMER🔄' +
                                    lastToolCall +
                                    content.substring(endOfToolCall)
                                }
                              }
                            }

                            return (
                              <Streamdown
                                components={{
                                  code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
                                    <code className={`${className} !text-xs`} {...props}>
                                      {children}
                                    </code>
                                  ),
                                  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
                                    <pre className="!text-xs" {...props}>
                                      {children}
                                    </pre>
                                  ),
                                  p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => {
                                    // Extract text from complex children structures
                                    const childrenArray = Children.toArray(children)
                                    const textParts: string[] = []

                                    childrenArray.forEach((child) => {
                                      if (typeof child === 'string') {
                                        textParts.push(child)
                                      } else if (isValidElement(child)) {
                                        // It's a React element - keep it as-is, don't stringify
                                        // This will be handled by React
                                      }
                                      // Skip plain objects entirely
                                    })

                                    const text = textParts.join('')
                                    const hasShimmerMarker = text.includes('🔄SHIMMER🔄')
                                    const isToolCall =
                                      /^(🔄SHIMMER🔄)?(Editing|Reading|Running|Listing|Executing|Searching|Finding|Grep)/i.test(
                                        text,
                                      )

                                    // Always remove the marker from display (global replace to catch all instances)
                                    const displayText = text.replace(/🔄SHIMMER🔄/g, '')

                                    // If we have React elements, also remove marker from string children
                                    const hasReactElements = childrenArray.some((child) => isValidElement(child))
                                    const cleanedChildren = hasReactElements
                                      ? childrenArray
                                          .map((child) =>
                                            typeof child === 'string' ? child.replace(/🔄SHIMMER🔄/g, '') : child,
                                          )
                                          .filter((child) => typeof child === 'string' || isValidElement(child))
                                      : displayText

                                    return (
                                      <p
                                        className={
                                          isToolCall
                                            ? hasShimmerMarker
                                              ? 'bg-gradient-to-r from-muted-foreground from-20% via-foreground/40 via-50% to-muted-foreground to-80% bg-clip-text text-transparent bg-[length:300%_100%] animate-[shimmer_1.5s_linear_infinite]'
                                              : 'text-muted-foreground/60'
                                            : ''
                                        }
                                        {...props}
                                      >
                                        {cleanedChildren}
                                      </p>
                                    )
                                  },
                                  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
                                    <ul className="text-xs list-disc ml-4" {...props}>
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
                                    <ol className="text-xs list-decimal ml-4" {...props}>
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
                                    <li className="text-xs mb-2" {...props}>
                                      {Children.toArray(children).filter(
                                        (c) => typeof c === 'string' || isValidElement(c),
                                      )}
                                    </li>
                                  ),
                                }}
                              >
                                {processedContent}
                              </Streamdown>
                            )
                          })()}
                    </div>
                    <div className="flex items-center gap-0.5 justify-end">
                      {/* Show copy button only when task is complete */}
                      {task.status !== 'processing' && task.status !== 'pending' && (
                        <button
                          onClick={() => handleCopyMessage(agentMessage.id, parseAgentMessage(agentMessage.content))}
                          className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center"
                        >
                          {copiedMessageId === agentMessage.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {/* Show "Awaiting response..." or "Awaiting response..." if task is processing and latest message is from user without response */}
        {(task.status === 'processing' || task.status === 'pending') &&
          displayMessages.length > 0 &&
          (() => {
            const lastMessage = displayMessages[displayMessages.length - 1]
            // Show placeholder if last message is a user message (no agent response yet)
            if (lastMessage.role === 'user') {
              // Check if this is the first user message (sandbox initialization)
              const userMessages = displayMessages.filter((m) => m.role === 'user')
              const isFirstMessage = userMessages.length === 1
              const placeholderText = isFirstMessage ? 'Awaiting response...' : 'Awaiting response...'

              return (
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground px-2">
                    <div className="opacity-50">
                      <div className="italic">{placeholderText}</div>
                      <div className="text-right font-mono opacity-70 mt-1">
                        {formatDuration(lastMessage.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
            return null
          })()}

        <div ref={messagesEndRef} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Tabs */}
      <div className="py-2 flex items-center justify-between gap-1 flex-shrink-0 h-[46px] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-sm font-semibold px-2 py-1 rounded transition-colors whitespace-nowrap flex-shrink-0 ${
              currentTab === 'chat' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`text-sm font-semibold px-2 py-1 rounded transition-colors whitespace-nowrap flex-shrink-0 ${
              currentTab === 'comments' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`text-sm font-semibold px-2 py-1 rounded transition-colors whitespace-nowrap flex-shrink-0 ${
              currentTab === 'actions' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Checks
          </button>
          <button
            onClick={() => setActiveTab('deployments')}
            className={`text-sm font-semibold px-2 py-1 rounded transition-colors whitespace-nowrap flex-shrink-0 ${
              currentTab === 'deployments' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Deployments
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-6 w-6 p-0 flex-shrink-0" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Input Area (only for chat tab) */}
      {activeTab === 'chat' && (
        <div className="flex-shrink-0 relative">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a follow-up message..."
            className="w-full min-h-[60px] max-h-[120px] resize-none pr-12 text-base md:text-xs"
            disabled={isSending}
          />
          {task.status === 'processing' || task.status === 'pending' ? (
            <button
              onClick={handleStopTask}
              disabled={isStopping}
              className="absolute bottom-2 right-2 rounded-full h-5 w-5 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isSending}
              className="absolute bottom-2 right-2 rounded-full h-5 w-5 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
