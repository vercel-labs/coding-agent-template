'use client'

import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface TerminalProps {
  taskId: string
  className?: string
  isActive?: boolean
  isMobile?: boolean
}

interface TerminalLine {
  type: 'command' | 'output' | 'error'
  content: string
  timestamp: Date
}

export interface TerminalRef {
  clear: () => void
  getTerminalText: () => string
}

export const Terminal = forwardRef<TerminalRef, TerminalProps>(function Terminal(
  { taskId, className, isActive, isMobile },
  ref,
) {
  const [history, setHistory] = useState<TerminalLine[]>([])
  const [currentCommand, setCurrentCommand] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [cwd, setCwd] = useState('/home/vercel-sandbox')
  const [isAutocompleting, setIsAutocompleting] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    clear: () => {
      setHistory([])
      setCommandHistory([])
      setHistoryIndex(-1)
    },
    getTerminalText: () => {
      return history
        .map((line) => {
          if (line.type === 'command') {
            return `$ ${line.content}`
          }
          return line.content
        })
        .join('\n')
    },
  }))

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [history])

  // Focus input when terminal becomes active (desktop only)
  useEffect(() => {
    if (isActive && !isMobile) {
      inputRef.current?.focus()
    }
  }, [isActive, isMobile])

  // Focus input when clicking anywhere in terminal (but not when selecting text or on mobile)
  const handleTerminalClick = () => {
    // Don't focus if user is selecting text or on mobile
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      return
    }
    if (!isMobile) {
      inputRef.current?.focus()
    }
  }

  const executeCommand = async (command: string) => {
    if (!command.trim() || isExecuting) return

    // Clear input immediately
    setCurrentCommand('')
    setIsExecuting(true)

    // Add command to history
    setHistory((prev) => [
      ...prev,
      {
        type: 'command',
        content: command,
        timestamp: new Date(),
      },
    ])

    // Add to command history
    setCommandHistory((prev) => [...prev, command])
    setHistoryIndex(-1)

    // Track directory changes
    if (command.trim().startsWith('cd ')) {
      // cwd will be updated based on the command result
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}/terminal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        // Add output to history
        const newLines: TerminalLine[] = []

        if (result.data.stdout) {
          newLines.push({
            type: 'output',
            content: result.data.stdout,
            timestamp: new Date(),
          })
        }

        if (result.data.stderr) {
          newLines.push({
            type: 'error',
            content: result.data.stderr,
            timestamp: new Date(),
          })
        }

        setHistory((prev) => [...prev, ...newLines])

        // Update cwd after successful cd command
        if (command.trim().startsWith('cd ') && result.data.exitCode === 0) {
          try {
            const pwdResponse = await fetch(`/api/tasks/${taskId}/terminal`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ command: 'pwd' }),
            })
            const pwdResult = await pwdResponse.json()
            if (pwdResult.success && pwdResult.data.stdout) {
              setCwd(pwdResult.data.stdout.trim())
            }
          } catch {
            // Ignore errors updating cwd
          }
        }
      } else {
        // Show error
        setHistory((prev) => [
          ...prev,
          {
            type: 'error',
            content: result.error || 'Command execution failed',
            timestamp: new Date(),
          },
        ])
      }
    } catch (error) {
      console.error('Error executing command:', error)
      setHistory((prev) => [
        ...prev,
        {
          type: 'error',
          content: 'Failed to execute command',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsExecuting(false)
    }
  }

  const handleTabComplete = async () => {
    if (isAutocompleting || !currentCommand.trim()) return

    setIsAutocompleting(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partial: currentCommand,
          cwd,
        }),
      })

      const result = await response.json()

      if (response.ok && result.success && result.data.completions.length > 0) {
        const completions = result.data.completions
        const prefix = result.data.prefix

        if (completions.length === 1) {
          // Single match - complete it
          const completion = completions[0]
          const parts = currentCommand.split(/\s+/)
          const lastPart = parts[parts.length - 1] || ''

          let newCommand = currentCommand
          if (lastPart.includes('/')) {
            const lastSlash = lastPart.lastIndexOf('/')
            const pathPart = lastPart.substring(0, lastSlash + 1)
            newCommand =
              currentCommand.substring(0, currentCommand.length - lastPart.length) + pathPart + completion.name
          } else {
            newCommand = currentCommand.substring(0, currentCommand.length - prefix.length) + completion.name
          }

          setCurrentCommand(newCommand)
        } else {
          // Multiple matches - show them
          const completionList = completions.map((c: { name: string; isDirectory: boolean }) => c.name).join('  ')
          setHistory((prev) => [
            ...prev,
            {
              type: 'output',
              content: completionList,
              timestamp: new Date(),
            },
          ])

          // Find common prefix
          if (completions.length > 1) {
            let commonPrefix = completions[0].name
            for (const completion of completions) {
              let i = 0
              while (i < commonPrefix.length && i < completion.name.length && commonPrefix[i] === completion.name[i]) {
                i++
              }
              commonPrefix = commonPrefix.substring(0, i)
            }

            if (commonPrefix.length > prefix.length) {
              // Complete to common prefix
              const parts = currentCommand.split(/\s+/)
              const lastPart = parts[parts.length - 1] || ''

              let newCommand = currentCommand
              if (lastPart.includes('/')) {
                const lastSlash = lastPart.lastIndexOf('/')
                const pathPart = lastPart.substring(0, lastSlash + 1)
                newCommand =
                  currentCommand.substring(0, currentCommand.length - lastPart.length) + pathPart + commonPrefix
              } else {
                newCommand = currentCommand.substring(0, currentCommand.length - prefix.length) + commonPrefix
              }

              setCurrentCommand(newCommand)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error autocompleting:', error)
    } finally {
      setIsAutocompleting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand(currentCommand)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleTabComplete()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex + 1
        if (newIndex < commandHistory.length) {
          setHistoryIndex(newIndex)
          setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex])
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCurrentCommand('')
      }
    }
  }

  return (
    <div
      className={cn('flex flex-col h-full bg-black text-green-400 font-mono text-xs', className)}
      onClick={handleTerminalClick}
    >
      {/* Terminal output */}
      <div ref={terminalRef} className="flex-1 overflow-y-auto p-2 leading-relaxed">
        {history.length === 0 && (
          <div className="text-muted-foreground">
            <p>Terminal ready. Type commands to execute in the Vercel Sandbox.</p>
            <p className="mt-1">Press Up/Down arrows to navigate command history.</p>
          </div>
        )}
        {history.map((line, index) => {
          const color =
            line.type === 'command' ? 'text-cyan-400' : line.type === 'error' ? 'text-red-400' : 'text-white'

          return (
            <div key={index} className={cn('leading-tight', color)}>
              {line.type === 'command' && <span className="text-green-400">$ </span>}
              <span className="whitespace-pre-wrap break-words">{line.content}</span>
            </div>
          )
        })}
      </div>

      {/* Terminal input */}
      <div className="border-t p-2 flex items-center gap-2">
        <div className="w-[8px] flex items-center justify-center shrink-0">
          {isAutocompleting || isExecuting ? (
            <div className="grid grid-cols-2 gap-[1px]">
              {[0, 1, 2, 3, 4, 5].map((i) => {
                // Circular order: top-left, top-right, middle-right, bottom-right, bottom-left, middle-left
                const circularOrder = [0, 1, 3, 5, 4, 2]
                const delay = circularOrder.indexOf(i) * 0.1
                return (
                  <div
                    key={i}
                    className="w-[2px] h-[2px] bg-white rounded-[0.5px]"
                    style={{
                      animation: 'pulse 0.6s ease-in-out infinite',
                      animationDelay: `${delay}s`,
                    }}
                  />
                )
              })}
            </div>
          ) : (
            <span className="text-green-400">$</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={currentCommand}
          onChange={(e) => setCurrentCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none text-white text-base md:text-xs"
          placeholder="Type a command..."
          autoFocus={!isMobile}
        />
      </div>
    </div>
  )
})
