'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { DiffView, DiffModeEnum } from '@git-diff-view/react'
import { generateDiffFile } from '@git-diff-view/file'
import '@git-diff-view/react/styles/diff-view-pure.css'

interface DiffData {
  filename: string
  oldContent: string
  newContent: string
  language: string
}

interface FileDiffViewerProps {
  selectedFile?: string
  diffsCache?: Record<string, DiffData>
  isInitialLoading?: boolean
}

export function FileDiffViewer({ selectedFile, diffsCache, isInitialLoading }: FileDiffViewerProps) {
  const params = useParams()
  const taskId = params.taskId as string

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

      // Check if we have cached data first
      if (diffsCache && diffsCache[selectedFile]) {
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

        const response = await fetch(`/api/tasks/${taskId}/diff?${params.toString()}`)
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch diff data')
        }

        setDiffData(result.data)
      } catch (err) {
        console.error('Error fetching diff data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch diff data')
      } finally {
        setLoading(false)
      }
    }

    fetchDiffData()
  }, [taskId, selectedFile, diffsCache])

  const diffFile = useMemo(() => {
    if (!diffData) return null

    try {
      const file = generateDiffFile(
        diffData.filename,
        diffData.oldContent,
        diffData.filename,
        diffData.newContent,
        diffData.language,
        diffData.language,
      )

      file.initTheme(mounted ? theme : 'light')
      file.init()
      file.buildSplitDiffLines()
      file.buildUnifiedDiffLines()

      return file
    } catch (error) {
      console.error('Error generating diff file:', error)
      return null
    }
  }, [diffData, mounted, theme])

  if (!selectedFile) {
    // Don't show "No file selected" during initial loading
    if (isInitialLoading) {
      return null
    }

    return (
      <div className="flex items-center justify-center h-full text-center text-muted-foreground p-4">
        <div>
          <div className="mb-2 text-sm md:text-base">No file selected</div>
          <div className="text-xs md:text-sm">Click on a file in the file tree to view its diff</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xs md:text-sm text-muted-foreground">Loading diff...</p>
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

  if (!diffFile) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-destructive mb-2 text-xs md:text-sm">Error generating diff</p>
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
