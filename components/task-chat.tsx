'use client'

import { TaskMessage, Task } from '@/lib/db/schema'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, Loader2, Copy, Check, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Streamdown } from 'streamdown'

interface TaskChatProps {
  taskId: string
  task: Task
}

export function TaskChat({ taskId, task }: TaskChatProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)
  const previousMessagesHashRef = useRef('')
  const wasAtBottomRef = useRef(true)

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

  useEffect(() => {
    fetchMessages(true) // Show loading on initial fetch

    // Poll for new messages every 3 seconds without showing loading state
    const interval = setInterval(() => {
      fetchMessages(false) // Don't show loading on polls
    }, 3000)

    return () => clearInterval(interval)
  }, [fetchMessages])

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
      } else {
        toast.error(data.error || 'Failed to send message')
        setNewMessage(messageToSend) // Restore the message
      }
    } catch (err) {
      console.error('Error sending message:', err)
      toast.error('Failed to send message')
      setNewMessage(messageToSend) // Restore the message
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xs md:text-sm text-muted-foreground">Loading messages...</p>
        </div>
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

  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div className="text-sm md:text-base">No messages yet</div>
        </div>

        <div className="flex-shrink-0 relative">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a follow-up message..."
            className="w-full min-h-[60px] max-h-[120px] resize-none pr-12"
            disabled={isSending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            size="icon"
            className="absolute bottom-2 right-2 rounded-full h-8 w-8 p-0"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    )
  }

  // Show only the last 10 messages
  const displayMessages = messages.slice(-10)
  const hiddenMessagesCount = messages.length - displayMessages.length

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-4">
        {hiddenMessagesCount > 0 && (
          <div className="text-xs text-center text-muted-foreground opacity-50 mb-4 italic">
            {hiddenMessagesCount} older message{hiddenMessagesCount !== 1 ? 's' : ''} hidden
          </div>
        )}
        {displayMessages.map((message, index) => (
          <div
            key={message.id}
            className={`${index > 0 ? 'mt-4' : ''} ${message.role === 'user' ? 'sticky top-0 z-10 before:content-[""] before:absolute before:inset-0 before:-top-4 before:bg-background before:-z-10' : ''}`}
          >
            {message.role === 'user' ? (
              <Card className="p-2 bg-card rounded-md relative z-10">
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
                    }}
                  >
                    {message.content}
                  </Streamdown>
                </div>
                <div className="flex items-center gap-0.5 justify-end">
                  <button
                    onClick={() => handleRetryMessage(message.content)}
                    disabled={isSending}
                    className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center disabled:opacity-20"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleCopyMessage(message.id, message.content)}
                    className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center"
                  >
                    {copiedMessageId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </Card>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground px-2">
                  {!message.content.trim() && (task.status === 'processing' || task.status === 'pending')
                    ? (() => {
                        // Find the previous user message to get its createdAt for duration
                        const messageIndex = displayMessages.findIndex((m) => m.id === message.id)
                        const previousMessages = displayMessages.slice(0, messageIndex).reverse()
                        const previousUserMessage = previousMessages.find((m) => m.role === 'user')

                        return (
                          <div className="opacity-50">
                            <div className="italic">Generating response...</div>
                            {previousUserMessage && (
                              <div className="text-right font-mono opacity-70 mt-1">
                                {formatDuration(previousUserMessage.createdAt)}
                              </div>
                            )}
                          </div>
                        )
                      })()
                    : (() => {
                        // Determine if this is the last agent message
                        const agentMessages = displayMessages.filter((m) => m.role === 'agent')
                        const isLastAgentMessage =
                          agentMessages.length > 0 && agentMessages[agentMessages.length - 1].id === message.id

                        const isAgentWorking = task.status === 'processing' || task.status === 'pending'
                        const content = parseAgentMessage(message.content)

                        // Pre-process content to mark the last tool call with a special marker
                        let processedContent = content
                        if (isAgentWorking && isLastAgentMessage) {
                          // Find all tool calls
                          const toolCallRegex = /\n\n((?:Editing|Reading|Running|Listing|Executing)[^\n]*)/g
                          const matches = Array.from(content.matchAll(toolCallRegex))

                          if (matches.length > 0) {
                            // Get the last match
                            const lastMatch = matches[matches.length - 1]
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
                                // Check if this paragraph is a tool call
                                const text = String(children)
                                const hasShimmerMarker = text.includes('🔄SHIMMER🔄')
                                const isToolCall = /^(🔄SHIMMER🔄)?(Editing|Reading|Running|Listing|Executing)/i.test(
                                  text,
                                )

                                // Remove the marker from display
                                const displayText = text.replace('🔄SHIMMER🔄', '')

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
                                    {displayText}
                                  </p>
                                )
                              },
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
                      onClick={() => handleCopyMessage(message.id, parseAgentMessage(message.content))}
                      className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center"
                    >
                      {copiedMessageId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

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

      <div className="flex-shrink-0 relative">
        <Textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a follow-up message..."
          className="w-full min-h-[60px] max-h-[120px] resize-none pr-12 text-xs"
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
    </div>
  )
}
