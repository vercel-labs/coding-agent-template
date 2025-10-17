'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { DiffView, DiffModeEnum } from '@git-diff-view/react'
import { generateDiffFile } from '@git-diff-view/file'
import '@git-diff-view/react/styles/diff-view-pure.css'
import { FileEditor } from '@/components/file-editor'

interface DiffData {
  filename: string
  oldContent: string
  newContent: string
  language: string
  isBinary?: boolean
  isImage?: boolean
  isBase64?: boolean
}

interface FileDiffViewerProps {
  selectedFile?: string
  diffsCache?: Record<string, DiffData>
  isInitialLoading?: boolean
  viewMode?: 'local' | 'remote' | 'all' | 'all-local' | 'changes'
  taskId?: string
  onUnsavedChanges?: (hasChanges: boolean) => void
  onSavingStateChange?: (isSaving: boolean) => void
  onOpenFile?: (filename: string, lineNumber?: number) => void
}

export function FileDiffViewer({
  selectedFile,
  diffsCache,
  isInitialLoading,
  viewMode = 'remote',
  taskId: taskIdProp,
  onUnsavedChanges,
  onSavingStateChange,
  onOpenFile,
}: FileDiffViewerProps) {
  const params = useParams()
  const taskId = taskIdProp || (params.taskId as string)

  const [diffData, setDiffData] = useState<DiffData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const diffViewMode = DiffModeEnum.Unified // Always use unified view
  const [mounted, setMounted] = useState(false)

  // Detect theme from parent window or system - only on client
  useEffect(() => {
    setMounted(true)

    const detectTheme = () => {
      try {
        const parentHasDarkClass = document.documentElement.classList.contains('dark')
        const parentMediaQuery = window.matchMedia('(prefers-color-scheme: dark)').matches
        const parentTheme = parentHasDarkClass || parentMediaQuery ? 'dark' : 'light'
        setTheme(parentTheme)
      } catch (e) {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        setTheme(systemTheme)
      }
    }

    detectTheme()

    // Listen for theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = () => detectTheme()
    mediaQuery.addEventListener('change', handleThemeChange)

    // Watch for class changes on document element
    const observer = new MutationObserver(handleThemeChange)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const fetchDiffData = async () => {
      if (!selectedFile || !taskId) {
        setDiffData(null)
        setError(null)
        setLoading(false)
        return
      }

      // Check if we have cached data first (only in changes mode)
      if (viewMode === 'changes' && diffsCache && diffsCache[selectedFile]) {
        setDiffData(diffsCache[selectedFile])
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set('filename', selectedFile)

        // In "all" or "all-local" mode, fetch file content; in "local" or "remote" mode, fetch diff
        const endpoint =
          viewMode === 'all' || viewMode === 'all-local'
            ? `/api/tasks/${taskId}/file-content`
            : `/api/tasks/${taskId}/diff`

        // For local mode, add a query parameter to get local diff instead of PR diff
        if (viewMode === 'local' || viewMode === 'all-local') {
          params.set('mode', 'local')
        }
        const response = await fetch(`${endpoint}?${params.toString()}`)
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch file data')
        }

        setDiffData(result.data)
      } catch (err) {
        console.error('Error fetching file data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch file data')
      } finally {
        setLoading(false)
      }
    }

    fetchDiffData()
  }, [taskId, selectedFile, diffsCache, viewMode])

  const diffFile = useMemo(() => {
    if (!diffData) return null

    // In "all" mode, show the file content without diff (oldContent will be empty)
    // In "changes" mode, check if contents are identical - no diff to show
    if (viewMode === 'changes' && diffData.oldContent === diffData.newContent) {
      console.log('File contents are identical - no changes to display')
      return null
    }

    try {
      const file = generateDiffFile(
        diffData.filename,
        diffData.oldContent || '',
        diffData.filename,
        diffData.newContent || '',
        diffData.language,
        diffData.language,
      )

      if (!file) {
        console.error('generateDiffFile returned null or undefined')
        return null
      }

      file.initTheme(mounted ? theme : 'light')
      file.init()
      file.buildSplitDiffLines()
      file.buildUnifiedDiffLines()

      return file
    } catch (error) {
      console.error('Error generating diff file:', error)
      return null
    }
  }, [diffData, mounted, theme, viewMode])

  if (!selectedFile) {
    // Don't show "No file selected" during initial loading
    if (isInitialLoading) {
      return null
    }

    return (
      <div className="flex items-center justify-center h-full text-center text-muted-foreground p-4">
        <div>
          <div className="mb-2 text-sm md:text-base">No file selected</div>
          <div className="text-xs md:text-sm">
            Click on a file in the file tree to view its {viewMode === 'changes' ? 'diff' : 'content'}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xs md:text-sm text-muted-foreground">
            Loading {viewMode === 'changes' ? 'diff' : 'file'}...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-destructive mb-2 text-xs md:text-sm">{error}</p>
          <p className="text-xs text-muted-foreground">Unable to load diff for {selectedFile}</p>
        </div>
      </div>
    )
  }

  if (!diffData) {
    return null
  }

  // Handle binary files (non-image)
  if (diffData.isBinary && !diffData.isImage) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="mb-4 text-4xl">📦</div>
          <p className="text-muted-foreground mb-2 text-sm md:text-base font-medium">Binary File</p>
          <p className="text-xs md:text-sm text-muted-foreground">This is binary content and cannot be displayed</p>
        </div>
      </div>
    )
  }

  // Handle image files
  if (diffData.isImage && diffData.newContent) {
    const getImageMimeType = (filename: string) => {
      const ext = filename.split('.').pop()?.toLowerCase()
      const mimeTypes: { [key: string]: string } = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        ico: 'image/x-icon',
        tiff: 'image/tiff',
        tif: 'image/tiff',
      }
      return mimeTypes[ext || ''] || 'image/png'
    }

    const mimeType = getImageMimeType(diffData.filename)
    const imageData = diffData.isBase64
      ? `data:${mimeType};base64,${diffData.newContent}`
      : `data:${mimeType};base64,${btoa(diffData.newContent)}`

    return (
      <div className="flex items-center justify-center h-full p-4 bg-muted/30">
        <div className="text-center max-w-full">
          <div className="mb-4">
            <img
              src={imageData}
              alt={diffData.filename}
              className="max-w-full max-h-[70vh] object-contain mx-auto rounded-lg shadow-lg"
              onError={(e) => {
                console.error('Error loading image')
                e.currentTarget.style.display = 'none'
                const parent = e.currentTarget.parentElement
                if (parent) {
                  parent.innerHTML = '<p class="text-destructive text-sm">Failed to load image</p>'
                }
              }}
            />
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">{diffData.filename}</p>
        </div>
      </div>
    )
  }

  // Render FileEditor for "all" or "all-local" mode with text files
  if ((viewMode === 'all' || viewMode === 'all-local') && diffData && !diffData.isBinary && !diffData.isImage) {
    return (
      <FileEditor
        filename={diffData.filename}
        initialContent={diffData.newContent}
        language={diffData.language}
        taskId={taskId}
        onUnsavedChanges={onUnsavedChanges}
        onSavingStateChange={onSavingStateChange}
        onOpenFile={onOpenFile}
      />
    )
  }

  if (!diffFile) {
    // Check if it's because contents are identical
    if (diffData.oldContent === diffData.newContent) {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-2 text-xs md:text-sm">No changes detected</p>
            <p className="text-xs text-muted-foreground">The file content is identical in both versions</p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-destructive mb-2 text-xs md:text-sm">Error generating diff</p>
          <p className="text-xs text-muted-foreground">Unable to generate diff for {selectedFile}</p>
        </div>
      </div>
    )
  }

  try {
    return (
      <div className="git-diff-view-container w-full">
        <DiffView
          key={`${selectedFile}-${diffData?.filename}`}
          diffFile={diffFile}
          diffViewMode={diffViewMode}
          diffViewTheme={mounted ? theme : 'light'}
          diffViewHighlight={true}
          diffViewWrap={true}
          diffViewFontSize={12}
        />
      </div>
    )
  } catch (error) {
    console.error('Error rendering diff:', error)
    return (
      <div className="flex items-center justify-center py-8 md:py-12 p-4">
        <div className="text-center">
          <p className="text-destructive mb-2 text-xs md:text-sm">Error rendering diff</p>
          <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    )
  }
}
