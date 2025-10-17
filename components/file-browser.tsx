'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  File,
  Folder,
  FolderOpen,
  Clock,
  GitBranch,
  Loader2,
  GitCommit,
  ExternalLink,
  Scissors,
  Copy,
  Clipboard,
  Lock,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAtom } from 'jotai'
import { getTaskFileBrowserState } from '@/lib/atoms/file-browser'
import { useMemo } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface FileChange {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  changes: number
}

interface FileTreeNode {
  type: 'file' | 'directory'
  filename?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  children?: { [key: string]: FileTreeNode }
}

interface FileBrowserProps {
  taskId: string
  branchName?: string | null
  repoUrl?: string | null
  onFileSelect?: (filename: string) => void
  onFilesLoaded?: (filenames: string[]) => void
  selectedFile?: string
  refreshKey?: number
  viewMode?: 'local' | 'remote' | 'all' | 'all-local'
  onViewModeChange?: (mode: 'local' | 'remote' | 'all' | 'all-local') => void
  hideHeader?: boolean
}

export function FileBrowser({
  taskId,
  branchName,
  repoUrl,
  onFileSelect,
  onFilesLoaded,
  selectedFile,
  refreshKey,
  viewMode = 'remote',
  onViewModeChange,
  hideHeader = false,
}: FileBrowserProps) {
  // Use Jotai atom for state management
  const taskStateAtom = useMemo(() => getTaskFileBrowserState(taskId), [taskId])
  const [state, setState] = useAtom(taskStateAtom)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Clipboard state for cut/copy/paste
  const [clipboardFile, setClipboardFile] = useState<{ filename: string; operation: 'cut' | 'copy' } | null>(null)

  // Context menu state - track which file has an open context menu
  const [contextMenuFile, setContextMenuFile] = useState<string | null>(null)

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{ path: string; type: 'file' | 'folder' } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Dialog state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showCommitMessageDialog, setShowCommitMessageDialog] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')

  // Detect OS for keyboard shortcuts
  const isMac = useMemo(() => {
    if (typeof window === 'undefined') return false
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0
  }, [])

  // Get current viewMode data with default values
  const currentViewData = (state as any)[viewMode] || {
    files: [],
    fileTree: {},
    expandedFolders: new Set<string>(),
    fetchAttempted: false,
  }
  const { files, fileTree, expandedFolders, fetchAttempted } = currentViewData
  const { loading, error } = state

  // Helper function to recursively collect all folder paths
  const getAllFolderPaths = useCallback(function collectPaths(
    tree: { [key: string]: FileTreeNode },
    basePath = '',
  ): string[] {
    const paths: string[] = []

    Object.entries(tree).forEach(([name, node]) => {
      const fullPath = basePath ? `${basePath}/${name}` : name

      if (node.type === 'directory') {
        paths.push(fullPath)
        if (node.children) {
          paths.push(...collectPaths(node.children, fullPath))
        }
      }
    })

    return paths
  }, [])

  const fetchBranchFiles = useCallback(async () => {
    if (!branchName) return

    setState({ loading: true, error: null })

    try {
      const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
      const response = await fetch(url)
      const result = await response.json()

      if (result.success) {
        const fetchedFiles = result.files || []
        const fetchedFileTree = result.fileTree || {}

        // In "local" or "remote" mode, expand all folders by default
        // In "all" mode, collapse all folders by default
        const newExpandedFolders =
          viewMode === 'local' || viewMode === 'remote'
            ? new Set(getAllFolderPaths(fetchedFileTree))
            : new Set<string>()

        // Update the specific viewMode data
        setState({
          [viewMode]: {
            files: fetchedFiles,
            fileTree: fetchedFileTree,
            expandedFolders: newExpandedFolders,
            fetchAttempted: true,
          },
          loading: false,
          error: null,
        })

        // Notify parent component with list of filenames
        if (onFilesLoaded && fetchedFiles.length > 0) {
          onFilesLoaded(fetchedFiles.map((f: FileChange) => f.filename))
        }
      } else {
        setState({
          [viewMode]: {
            files: [],
            fileTree: {},
            expandedFolders: new Set<string>(),
            fetchAttempted: true,
          },
          loading: false,
          error: result.error || 'Failed to fetch files',
        })
      }
    } catch (err) {
      setState({
        [viewMode]: {
          files: [],
          fileTree: {},
          expandedFolders: new Set<string>(),
          fetchAttempted: true,
        },
        loading: false,
        error: 'Failed to fetch branch files',
      })
    }
  }, [branchName, taskId, onFilesLoaded, viewMode, setState, getAllFolderPaths])

  const handleSyncChanges = useCallback(async () => {
    if (isSyncing || !branchName) return

    setIsSyncing(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}/sync-changes`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to sync changes')
      }

      toast.success('Changes synced successfully')

      // Refresh the file list in the background without showing loader
      try {
        const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
        const fetchResponse = await fetch(url)
        const fetchResult = await fetchResponse.json()

        if (fetchResult.success) {
          const fetchedFiles = fetchResult.files || []
          const fetchedFileTree = fetchResult.fileTree || {}

          // Update the specific viewMode data without changing loading state
          setState({
            [viewMode]: {
              files: fetchedFiles,
              fileTree: fetchedFileTree,
              expandedFolders: currentViewData.expandedFolders, // Preserve expanded state
              fetchAttempted: true,
            },
          })
        }
      } catch (err) {
        console.error('Error refreshing file list:', err)
        // Silently fail - the sync operation succeeded
      }
    } catch (err) {
      console.error('Error syncing changes:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to sync changes')
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, branchName, taskId, viewMode, currentViewData, setState])

  const handleResetChanges = useCallback(async () => {
    if (isResetting || !branchName) return

    setIsResetting(true)
    setShowCommitMessageDialog(false)

    try {
      const response = await fetch(`/api/tasks/${taskId}/reset-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitMessage: commitMessage || 'Reset changes',
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reset changes')
      }

      toast.success('Changes reset successfully')
      setCommitMessage('')

      // Refresh the file list in the background without showing loader
      try {
        const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
        const fetchResponse = await fetch(url)
        const fetchResult = await fetchResponse.json()

        if (fetchResult.success) {
          const fetchedFiles = fetchResult.files || []
          const fetchedFileTree = fetchResult.fileTree || {}

          // Update the specific viewMode data without changing loading state
          setState({
            [viewMode]: {
              files: fetchedFiles,
              fileTree: fetchedFileTree,
              expandedFolders: currentViewData.expandedFolders, // Preserve expanded state
              fetchAttempted: true,
            },
          })
        }
      } catch (err) {
        console.error('Error refreshing file list:', err)
        // Silently fail - the reset operation succeeded
      }
    } catch (err) {
      console.error('Error resetting changes:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to reset changes')
    } finally {
      setIsResetting(false)
    }
  }, [isResetting, branchName, taskId, commitMessage, viewMode, currentViewData, setState])

  // Clear error when switching modes
  useEffect(() => {
    setState({ error: null })
  }, [viewMode, setState])

  useEffect(() => {
    // Only fetch if we don't have files for this viewMode yet AND haven't attempted to fetch
    if (branchName && files.length === 0 && !loading && !fetchAttempted) {
      fetchBranchFiles()
    }
  }, [branchName, files.length, loading, fetchAttempted, fetchBranchFiles])

  // Separate effect for refreshKey to force refetch
  useEffect(() => {
    if (branchName && refreshKey !== undefined && refreshKey > 0) {
      // Reset fetchAttempted flag to allow refetch
      setState({
        [viewMode]: {
          ...currentViewData,
          fetchAttempted: false,
        },
      })
      fetchBranchFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, branchName])

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    // Update only the current viewMode's expanded folders
    setState({
      [viewMode]: {
        ...currentViewData,
        expandedFolders: newExpanded,
      },
    })
  }

  // Context menu handlers
  const handleOpenOnGitHub = useCallback(
    (filename: string) => {
      if (!repoUrl || !branchName) {
        toast.error('Repository URL or branch name not available')
        return
      }

      try {
        // Parse repo URL to get owner/repo
        const repoPath = repoUrl.replace('https://github.com/', '').replace('.git', '')
        const githubFileUrl = `https://github.com/${repoPath}/blob/${branchName}/${filename}`
        window.open(githubFileUrl, '_blank', 'noopener,noreferrer')
      } catch (err) {
        console.error('Error opening GitHub URL:', err)
        toast.error('Failed to open file on GitHub')
      }
    },
    [repoUrl, branchName],
  )

  const handleCut = useCallback((filename: string) => {
    setClipboardFile({ filename, operation: 'cut' })
    toast.success('File cut to clipboard')
  }, [])

  const handleCopy = useCallback((filename: string) => {
    setClipboardFile({ filename, operation: 'copy' })
    toast.success('File copied to clipboard')
  }, [])

  const handlePaste = useCallback(
    async (targetPath?: string) => {
      if (!clipboardFile) {
        toast.error('No file in clipboard')
        return
      }

      try {
        const response = await fetch(`/api/tasks/${taskId}/file-operation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operation: clipboardFile.operation,
            sourceFile: clipboardFile.filename,
            targetPath: targetPath || null,
          }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to paste file')
        }

        toast.success(clipboardFile.operation === 'cut' ? 'File moved successfully' : 'File copied successfully')

        // Clear clipboard after paste
        if (clipboardFile.operation === 'cut') {
          setClipboardFile(null)
        }

        // Refresh the file list in the background without showing loader
        try {
          const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
          const fetchResponse = await fetch(url)
          const fetchResult = await fetchResponse.json()

          if (fetchResult.success) {
            const fetchedFiles = fetchResult.files || []
            const fetchedFileTree = fetchResult.fileTree || {}

            // Update the specific viewMode data without changing loading state
            setState({
              [viewMode]: {
                files: fetchedFiles,
                fileTree: fetchedFileTree,
                expandedFolders: currentViewData.expandedFolders, // Preserve expanded state
                fetchAttempted: true,
              },
            })
          }
        } catch (err) {
          console.error('Error refreshing file list:', err)
          // Silently fail - the paste operation succeeded
        }
      } catch (err) {
        console.error('Error pasting file:', err)
        toast.error(err instanceof Error ? err.message : 'Failed to paste file')
      }
    },
    [clipboardFile, taskId, viewMode, currentViewData, setState],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, filename: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuFile(filename)
  }, [])

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, path: string, type: 'file' | 'folder') => {
      if (viewMode !== 'local' && viewMode !== 'all-local') {
        e.preventDefault()
        return
      }

      e.stopPropagation() // Prevent folder toggle on drag start
      setDraggedItem({ path, type })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', path)
    },
    [viewMode],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null)
    setDropTarget(null)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      if (!draggedItem || (viewMode !== 'local' && viewMode !== 'all-local')) {
        return
      }

      // Don't allow dropping on itself or its children
      if (draggedItem.path === folderPath || folderPath.startsWith(draggedItem.path + '/')) {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      setDropTarget(folderPath)
    },
    [draggedItem, viewMode],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetFolderPath: string) => {
      e.preventDefault()
      e.stopPropagation()

      if (!draggedItem) return

      // Don't allow dropping on itself or its children
      if (draggedItem.path === targetFolderPath || targetFolderPath.startsWith(draggedItem.path + '/')) {
        toast.error('Cannot move a folder into itself')
        setDraggedItem(null)
        setDropTarget(null)
        return
      }

      try {
        const response = await fetch(`/api/tasks/${taskId}/file-operation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operation: 'cut', // Drag and drop is always a move operation
            sourceFile: draggedItem.path,
            targetPath: targetFolderPath === '__root__' ? null : targetFolderPath,
          }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to move item')
        }

        toast.success(`${draggedItem.type === 'folder' ? 'Folder' : 'File'} moved successfully`)

        // Refresh the file list in the background
        try {
          const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
          const fetchResponse = await fetch(url)
          const fetchResult = await fetchResponse.json()

          if (fetchResult.success) {
            const fetchedFiles = fetchResult.files || []
            const fetchedFileTree = fetchResult.fileTree || {}

            // Keep the target folder expanded
            const newExpandedFolders = new Set(currentViewData.expandedFolders)
            if (targetFolderPath !== '__root__') {
              newExpandedFolders.add(targetFolderPath)
            }

            setState({
              [viewMode]: {
                files: fetchedFiles,
                fileTree: fetchedFileTree,
                expandedFolders: newExpandedFolders,
                fetchAttempted: true,
              },
            })
          }
        } catch (err) {
          console.error('Error refreshing file list:', err)
        }
      } catch (err) {
        console.error('Error moving item:', err)
        toast.error(err instanceof Error ? err.message : 'Failed to move item')
      } finally {
        setDraggedItem(null)
        setDropTarget(null)
      }
    },
    [draggedItem, taskId, viewMode, currentViewData, setState],
  )

  // Keyboard shortcut handler for paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle paste in sandbox mode
      if (viewMode !== 'local' && viewMode !== 'all-local') return

      // Check for Ctrl+V (Windows/Linux) or Cmd+V (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardFile) {
        e.preventDefault()
        handlePaste()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, clipboardFile, handlePaste])

  const renderFileTree = (tree: { [key: string]: FileTreeNode }, path = '') => {
    // Sort entries: directories first, then files, both alphabetically
    const sortedEntries = Object.entries(tree).sort(([nameA, nodeA], [nameB, nodeB]) => {
      // If one is a directory and the other is a file, directory comes first
      if (nodeA.type === 'directory' && nodeB.type === 'file') return -1
      if (nodeA.type === 'file' && nodeB.type === 'directory') return 1
      // If both are the same type, sort alphabetically (case-insensitive)
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase())
    })

    return sortedEntries.map(([name, node]) => {
      const fullPath = path ? `${path}/${name}` : name

      if (node.type === 'directory') {
        const isExpanded = expandedFolders.has(fullPath)
        const isSandboxMode = viewMode === 'local' || viewMode === 'all-local'
        const isRemoteMode = viewMode === 'remote' || viewMode === 'all'
        const isFolderContextMenuOpen = contextMenuFile === fullPath
        const isDropTarget = dropTarget === fullPath
        const isDragging = draggedItem?.path === fullPath

        return (
          <div key={fullPath}>
            <DropdownMenu open={isFolderContextMenuOpen} onOpenChange={(open) => !open && setContextMenuFile(null)}>
              <div
                draggable={isSandboxMode}
                onDragStart={(e) => handleDragStart(e, fullPath, 'folder')}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, fullPath)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, fullPath)}
                className={`flex items-center gap-2 px-2 md:px-3 py-1.5 hover:bg-card/50 rounded-sm ${
                  isDropTarget ? 'bg-blue-500/20' : ''
                } ${isDragging ? 'opacity-50 cursor-move' : 'cursor-pointer'}`}
                onClick={() => toggleFolder(fullPath)}
                onContextMenu={(e) => handleContextMenu(e, fullPath)}
              >
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
                )}
                <span className="text-xs md:text-sm font-medium truncate">{name}</span>
                {isRemoteMode && (
                  <Lock className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground/50 flex-shrink-0 ml-auto" />
                )}
              </div>
              {isSandboxMode && (
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handlePaste(fullPath)} disabled={!clipboardFile}>
                    <Clipboard className="w-4 h-4 mr-2" />
                    Paste
                    <DropdownMenuShortcut>{isMac ? '⌘V' : 'Ctrl+V'}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
            {isExpanded && node.children && (
              <div className="ml-3 md:ml-4">{renderFileTree(node.children, fullPath)}</div>
            )}
          </div>
        )
      } else {
        // File node
        const isSelected = selectedFile === node.filename
        const isSandboxMode = viewMode === 'local' || viewMode === 'all-local'
        const isRemoteMode = viewMode === 'remote' || viewMode === 'all'
        const isContextMenuOpen = contextMenuFile === node.filename
        const isCut = clipboardFile?.filename === node.filename && clipboardFile?.operation === 'cut'
        const isDragging = draggedItem?.path === node.filename

        return (
          <DropdownMenu
            key={fullPath}
            open={isContextMenuOpen}
            onOpenChange={(open) => !open && setContextMenuFile(null)}
          >
            <div
              draggable={isSandboxMode}
              onDragStart={(e) => handleDragStart(e, node.filename!, 'file')}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-sm ${
                isSelected ? 'bg-card' : 'hover:bg-card/50'
              } ${isCut || isDragging ? 'opacity-50' : ''} ${isDragging ? 'cursor-move' : 'cursor-pointer'}`}
              onClick={() => onFileSelect?.(node.filename!)}
              onContextMenu={(e) => handleContextMenu(e, node.filename!)}
            >
              <File className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs md:text-sm flex-1 truncate">{name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {(viewMode === 'local' || viewMode === 'remote') && (node.additions || node.deletions) && (
                  <div className="flex items-center gap-1 text-xs">
                    {node.additions && node.additions > 0 && <span className="text-green-600">+{node.additions}</span>}
                    {node.deletions && node.deletions > 0 && <span className="text-red-600">-{node.deletions}</span>}
                  </div>
                )}
                {isRemoteMode && <Lock className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground/50" />}
              </div>
            </div>
            <DropdownMenuContent>
              {isRemoteMode && (
                <DropdownMenuItem onClick={() => handleOpenOnGitHub(node.filename!)}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open on GitHub
                </DropdownMenuItem>
              )}
              {isSandboxMode && (
                <>
                  <DropdownMenuItem onClick={() => handleCut(node.filename!)}>
                    <Scissors className="w-4 h-4 mr-2" />
                    Cut
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCopy(node.filename!)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePaste()} disabled={!clipboardFile}>
                    <Clipboard className="w-4 h-4 mr-2" />
                    Paste
                    <DropdownMenuShortcut>{isMac ? '⌘V' : 'Ctrl+V'}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    })
  }

  if (!branchName) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 md:p-4 border-b">
          <h3 className="text-base md:text-lg font-semibold">Files</h3>
          <p className="text-xs md:text-sm text-muted-foreground">Task in progress</p>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 md:p-6">
          <div className="text-center space-y-3 md:space-y-4">
            <div className="flex justify-center">
              <div className="flex items-center gap-2 text-amber-500">
                <Clock className="w-5 h-5 md:w-6 md:h-6" />
                <GitBranch className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm md:text-base font-medium">Branch Not Created Yet</h4>
              <p className="text-xs md:text-sm text-muted-foreground max-w-xs px-2 md:px-0">
                The coding agent is still working on this task. File changes will appear here once the agent creates a
                branch.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">Check the logs for progress updates</div>
          </div>
        </div>
      </div>
    )
  }

  const filesPane = viewMode === 'all' || viewMode === 'all-local' ? 'files' : 'changes'
  const subMode = viewMode === 'all' || viewMode === 'remote' ? 'remote' : 'local'

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div>
          {/* Main Navigation with segment button on the right */}
          <div className="py-2 flex items-center justify-between h-[46px]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onViewModeChange?.(subMode === 'local' ? 'local' : 'remote')}
                className={`text-sm font-semibold px-2 py-1 rounded transition-colors ${
                  filesPane === 'changes' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Changes
              </button>
              <button
                onClick={() => onViewModeChange?.(subMode === 'local' ? 'all-local' : 'all')}
                className={`text-sm font-semibold px-2 py-1 rounded transition-colors ${
                  filesPane === 'files' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Files
              </button>
            </div>

            {/* Segment Button for Remote/Sandbox sub-modes */}
            <div className="inline-flex rounded-md border border-border bg-muted/50 p-0.5">
              <Button
                variant={subMode === 'remote' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange?.(filesPane === 'files' ? 'all' : 'remote')}
                className={`h-6 px-2 text-xs rounded-sm ${
                  subMode === 'remote'
                    ? 'bg-background shadow-sm hover:bg-background'
                    : 'hover:bg-transparent hover:text-foreground'
                }`}
              >
                Remote
              </Button>
              <Button
                variant={subMode === 'local' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange?.(filesPane === 'files' ? 'all-local' : 'local')}
                className={`h-6 px-2 text-xs rounded-sm ${
                  subMode === 'local'
                    ? 'bg-background shadow-sm hover:bg-background'
                    : 'hover:bg-transparent hover:text-foreground'
                }`}
              >
                Sandbox
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 md:p-4 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-destructive">{error}</div>
        ) : files.length === 0 ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-muted-foreground">
            {viewMode === 'local'
              ? 'No changes in sandbox'
              : viewMode === 'remote'
                ? 'No changes in PR'
                : 'No files found'}
          </div>
        ) : (
          <DropdownMenu
            open={contextMenuFile === '__root__'}
            onOpenChange={(open) => !open && setContextMenuFile(null)}
          >
            <div
              className={`py-2 min-h-full outline-none rounded-sm ${dropTarget === '__root__' ? 'bg-blue-500/10' : ''}`}
              onContextMenu={(e) => {
                if ((viewMode === 'local' || viewMode === 'all-local') && e.target === e.currentTarget) {
                  handleContextMenu(e, '__root__')
                }
              }}
              onDragOver={(e) => {
                if (viewMode === 'local' || viewMode === 'all-local') {
                  handleDragOver(e, '__root__')
                }
              }}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                if (viewMode === 'local' || viewMode === 'all-local') {
                  handleDrop(e, '__root__')
                }
              }}
            >
              {renderFileTree(fileTree)}
            </div>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handlePaste()} disabled={!clipboardFile}>
                <Clipboard className="w-4 h-4 mr-2" />
                Paste
                <DropdownMenuShortcut>{isMac ? '⌘V' : 'Ctrl+V'}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Sync and Reset buttons for Sandbox Changes - positioned at bottom */}
      {viewMode === 'local' && files.length > 0 && (
        <div className="p-2 border-t flex gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncChanges}
            disabled={isSyncing || isResetting}
            className="flex-1 text-xs"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <GitCommit className="h-3 w-3 mr-1.5" />
                Sync Changes
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResetConfirm(true)}
            disabled={isSyncing || isResetting}
            className="flex-1 text-xs"
          >
            {isResetting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Reset
              </>
            )}
          </Button>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all local changes in the sandbox to match the remote branch. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowResetConfirm(false)
                setShowCommitMessageDialog(true)
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Commit Message Dialog */}
      <Dialog open={showCommitMessageDialog} onOpenChange={setShowCommitMessageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit Message</DialogTitle>
            <DialogDescription>Enter a commit message for this reset operation (optional).</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="commit-message">Commit Message</Label>
            <Input
              id="commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Reset changes"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleResetChanges()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCommitMessageDialog(false)
                setCommitMessage('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleResetChanges} disabled={isResetting}>
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
