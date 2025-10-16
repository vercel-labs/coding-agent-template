'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

interface FileEditorProps {
  filename: string
  initialContent: string
  language: string
  taskId: string
  onUnsavedChanges?: (hasChanges: boolean) => void
  onSavingStateChange?: (isSaving: boolean) => void
}

export function FileEditor({
  filename,
  initialContent,
  language,
  taskId,
  onUnsavedChanges,
  onSavingStateChange,
}: FileEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)
  const [savedContent, setSavedContent] = useState(initialContent)
  const onUnsavedChangesRef = useRef(onUnsavedChanges)
  const onSavingStateChangeRef = useRef(onSavingStateChange)

  // Keep refs updated
  useEffect(() => {
    onUnsavedChangesRef.current = onUnsavedChanges
  }, [onUnsavedChanges])

  useEffect(() => {
    onSavingStateChangeRef.current = onSavingStateChange
  }, [onSavingStateChange])

  useEffect(() => {
    setContent(initialContent)
    setSavedContent(initialContent)
  }, [filename, initialContent])

  useEffect(() => {
    const hasChanges = content !== savedContent
    onUnsavedChangesRef.current?.(hasChanges)
  }, [content, savedContent])

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
  }

  const handleSave = useCallback(async () => {
    if (isSaving || content === savedContent) return

    setIsSaving(true)
    onSavingStateChangeRef.current?.(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/save-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          content,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSavedContent(content)
      } else {
        toast.error(data.error || 'Failed to save file')
      }
    } catch (error) {
      console.error('Error saving file:', error)
      toast.error('Failed to save file')
    } finally {
      setIsSaving(false)
      onSavingStateChangeRef.current?.(false)
    }
  }, [isSaving, content, savedContent, taskId, filename])

  // Keyboard shortcut for save (Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  return (
    <div className="flex flex-col h-full">
      {/* Code Editor */}
      <div className="flex-1 overflow-auto">
        <textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          className="w-full h-full p-4 font-mono text-sm bg-background text-foreground resize-none focus:outline-none"
          spellCheck={false}
          style={{
            tabSize: 2,
            lineHeight: '1.5',
          }}
        />
      </div>
    </div>
  )
}
