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
  FilePlus,
  FolderPlus,
  Trash2,
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
  onFileSelect?: (filename: string, isFolder?: boolean) => void
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
  const [isStartingSandbox, setIsStartingSandbox] = useState(false)

  // Clipboard state for cut/copy/paste
  const [clipboardFile, setClipboardFile] = useState<{ filename: string; operation: 'cut' | 'copy' } | null>(null)

  // Context menu state - track which file has an open context menu
  const [contextMenuFile, setContextMenuFile] = useState<string | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{ path: string; type: 'file' | 'folder' } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [isDraggingActive, setIsDraggingActive] = useState(false)

  // Dialog state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [syncCommitMessage, setSyncCommitMessage] = useState('')
  const [showCommitMessageDialog, setShowCommitMessageDialog] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFile, setIsCreatingFile] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [fileToDiscard, setFileToDiscard] = useState<string | null>(null)
  const [isDiscarding, setIsDiscarding] = useState(false)

  // Detect OS for keyboard shortcuts
  const isMac = useMemo(() => {
    if (typeof window === 'undefined') return false
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0
  }, [])

  // Get current viewMode data with default values
  interface ViewModeData {
    files: FileChange[]
    fileTree: { [key: string]: FileTreeNode }
    expandedFolders: Set<string>
    fetchAttempted: boolean
    error: string | null
  }

  type ViewModeKey = 'local' | 'remote' | 'all' | 'all-local'
  const currentViewData = (state[viewMode as ViewModeKey] as ViewModeData | undefined) || {
    files: [],
    fileTree: {},
    expandedFolders: new Set<string>(),
    fetchAttempted: false,
    error: null,
  }
  const { files, fileTree, expandedFolders, fetchAttempted, error } = currentViewData
  const { loading } = state

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

  // Helper function to find the first file in the tree (following visual sort order)
  const getFirstFile = useCallback(function findFirstFile(
    tree: { [key: string]: FileTreeNode },
    path = '',
  ): string | null {
    // Sort entries: directories first, then files, both alphabetically (same as renderFileTree)
    const sortedEntries = Object.entries(tree).sort(([nameA, nodeA], [nameB, nodeB]) => {
      if (nodeA.type === 'directory' && nodeB.type === 'file') return -1
      if (nodeA.type === 'file' && nodeB.type === 'directory') return 1
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase())
    })

    for (const [name, node] of sortedEntries) {
      const fullPath = path ? `${path}/${name}` : name

      if (node.type === 'file' && node.filename) {
        // Found the first file
        return node.filename
      } else if (node.type === 'directory' && node.children) {
        // Recursively search in this directory
        const firstFileInDir = findFirstFile(node.children, fullPath)
        if (firstFileInDir) {
          return firstFileInDir
        }
      }
    }

    return null
  }, [])

  const fetchBranchFiles = useCallback(async () => {
    if (!branchName) return

    // Only show loading spinner on initial load (when we have no files yet)
    // For refreshes, update in the background without showing spinner
    const isInitialLoad = files.length === 0 && !fetchAttempted

    if (isInitialLoad) {
      setState({ loading: true, error: null })
    }

    try {
      const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
      const response = await fetch(url)
      const result = await response.json()

      if (result.success) {
        const fetchedFiles = result.files || []
        const fetchedFileTree = result.fileTree || {}

        // In "local" or "remote" mode, expand all folders by default on initial load
        // In "all" mode, collapse all folders by default on initial load
        // For refreshes, preserve the current expanded state
        const newExpandedFolders = isInitialLoad
          ? viewMode === 'local' || viewMode === 'remote'
            ? new Set(getAllFolderPaths(fetchedFileTree))
            : new Set<string>()
          : expandedFolders

        // Update the specific viewMode data
        setState({
          [viewMode]: {
            files: fetchedFiles,
            fileTree: fetchedFileTree,
            expandedFolders: newExpandedFolders,
            fetchAttempted: true,
            error: null,
          },
          loading: false,
        })

        // Notify parent component with list of filenames
        if (onFilesLoaded && fetchedFiles.length > 0) {
          onFilesLoaded(fetchedFiles.map((f: FileChange) => f.filename))
        }

        // Auto-select the first file if no file is currently selected
        if (isInitialLoad && !selectedFile && fetchedFileTree && Object.keys(fetchedFileTree).length > 0) {
          const firstFile = getFirstFile(fetchedFileTree)
          if (firstFile && onFileSelect) {
            onFileSelect(firstFile, false)
          }
        }
      } else {
        // Check if the error is due to sandbox not running (410 Gone)
        const isSandboxNotRunning =
          response.status === 410 || result.error?.includes('Sandbox is not running') || result.error?.includes('410')
        const errorMessage = isSandboxNotRunning ? 'SANDBOX_NOT_RUNNING' : result.error || 'Failed to fetch files'

        setState({
          [viewMode]: {
            files: [],
            fileTree: {},
            expandedFolders: new Set<string>(),
            fetchAttempted: true,
            error: errorMessage,
          },
          loading: false,
        })
      }
    } catch (err) {
      setState({
        [viewMode]: {
          files: [],
          fileTree: {},
          expandedFolders: new Set<string>(),
          fetchAttempted: true,
          error: 'Failed to fetch branch files',
        },
        loading: false,
      })
    }
  }, [
    branchName,
    taskId,
    onFilesLoaded,
    viewMode,
    setState,
    getAllFolderPaths,
    files.length,
    fetchAttempted,
    expandedFolders,
    selectedFile,
    onFileSelect,
    getFirstFile,
  ])

  const handleSyncChanges = useCallback(async () => {
    if (isSyncing || !branchName) return

    setIsSyncing(true)
    setShowSyncDialog(false)

    try {
      const response = await fetch(`/api/tasks/${taskId}/sync-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitMessage: syncCommitMessage || 'Sync local changes',
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to sync changes')
      }

      toast.success('Changes synced successfully')
      setSyncCommitMessage('')

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
  }, [isSyncing, branchName, taskId, syncCommitMessage, viewMode, currentViewData, setState])

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

  const handleStartSandbox = useCallback(async () => {
    setIsStartingSandbox(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/start-sandbox`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Sandbox started! Loading files...')

        // Clear the error state immediately
        setState({
          [viewMode]: {
            files: [],
            fileTree: {},
            expandedFolders: new Set<string>(),
            fetchAttempted: false,
            error: null,
          },
          loading: true,
        })

        // Wait for sandbox to be ready and useTask to poll the updated task data
        // useTask polls every 5 seconds, so wait ~6 seconds to ensure we have latest data
        await new Promise((resolve) => setTimeout(resolve, 6000))

        // Now fetch the files with the updated task data
        await fetchBranchFiles()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to start sandbox')
      }
    } catch (error) {
      console.error('Error starting sandbox:', error)
      toast.error('Failed to start sandbox')
    } finally {
      setIsStartingSandbox(false)
    }
  }, [taskId, viewMode, setState, fetchBranchFiles])

  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) {
      toast.error('Please enter a file name')
      return
    }

    setIsCreatingFile(true)
    try {
      // If a folder is selected, prepend its path to the filename
      const isSelectedItemFolder =
        selectedFile && files.some((f: FileChange) => f.filename.startsWith(selectedFile + '/'))
      const filename =
        isSelectedItemFolder && !newFileName.includes('/')
          ? `${selectedFile}/${newFileName.trim()}`
          : newFileName.trim()

      const response = await fetch(`/api/tasks/${taskId}/create-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create file')
      }

      toast.success('File created successfully')
      setShowNewFileDialog(false)
      setNewFileName('')

      // Refresh the file list
      try {
        const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
        const fetchResponse = await fetch(url)
        const fetchResult = await fetchResponse.json()

        if (fetchResult.success) {
          const fetchedFiles = fetchResult.files || []
          const fetchedFileTree = fetchResult.fileTree || {}

          // Expand the parent folder if the file is nested
          const newExpandedFolders = new Set(currentViewData.expandedFolders)
          const parentPath = filename.split('/').slice(0, -1).join('/')
          if (parentPath) {
            newExpandedFolders.add(parentPath)
          }

          setState({
            [viewMode]: {
              files: fetchedFiles,
              fileTree: fetchedFileTree,
              expandedFolders: newExpandedFolders,
              fetchAttempted: true,
            },
          })

          // Select the newly created file
          if (onFileSelect) {
            onFileSelect(filename, false)
          }
        }
      } catch (err) {
        console.error('Error refreshing file list:', err)
      }
    } catch (err) {
      console.error('Error creating file:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create file')
    } finally {
      setIsCreatingFile(false)
    }
  }, [newFileName, taskId, viewMode, currentViewData, setState, onFileSelect, selectedFile, files])

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name')
      return
    }

    setIsCreatingFolder(true)
    try {
      // If a folder is selected, prepend its path to the foldername
      const isSelectedItemFolder =
        selectedFile && files.some((f: FileChange) => f.filename.startsWith(selectedFile + '/'))
      const foldername =
        isSelectedItemFolder && !newFolderName.includes('/')
          ? `${selectedFile}/${newFolderName.trim()}`
          : newFolderName.trim()

      const response = await fetch(`/api/tasks/${taskId}/create-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          foldername,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create folder')
      }

      toast.success('Folder created successfully')
      setShowNewFolderDialog(false)
      setNewFolderName('')

      // Refresh the file list
      try {
        const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
        const fetchResponse = await fetch(url)
        const fetchResult = await fetchResponse.json()

        if (fetchResult.success) {
          const fetchedFiles = fetchResult.files || []
          const fetchedFileTree = fetchResult.fileTree || {}

          // Expand the parent folder and the newly created folder
          const newExpandedFolders = new Set(currentViewData.expandedFolders)
          const parentPath = foldername.split('/').slice(0, -1).join('/')
          if (parentPath) {
            newExpandedFolders.add(parentPath)
          }
          newExpandedFolders.add(foldername)

          setState({
            [viewMode]: {
              files: fetchedFiles,
              fileTree: fetchedFileTree,
              expandedFolders: newExpandedFolders,
              fetchAttempted: true,
            },
          })

          // Select the newly created folder
          if (onFileSelect) {
            onFileSelect(foldername, true)
          }
        }
      } catch (err) {
        console.error('Error refreshing file list:', err)
      }
    } catch (err) {
      console.error('Error creating folder:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setIsCreatingFolder(false)
    }
  }, [newFolderName, taskId, viewMode, currentViewData, setState, selectedFile, files, onFileSelect])

  const handleDelete = useCallback(
    async (filename: string) => {
      if (!filename) {
        toast.error('No file selected for deletion')
        return
      }

      setIsDeleting(true)
      try {
        const response = await fetch(`/api/tasks/${taskId}/delete-file`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename,
          }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to delete file')
        }

        toast.success('File deleted successfully')
        setShowDeleteConfirm(false)
        setFileToDelete(null)

        // Refresh the file list
        try {
          const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
          const fetchResponse = await fetch(url)
          const fetchResult = await fetchResponse.json()

          if (fetchResult.success) {
            const fetchedFiles = fetchResult.files || []
            const fetchedFileTree = fetchResult.fileTree || {}

            setState({
              [viewMode]: {
                files: fetchedFiles,
                fileTree: fetchedFileTree,
                expandedFolders: currentViewData.expandedFolders,
                fetchAttempted: true,
              },
            })
          }
        } catch (err) {
          console.error('Error refreshing file list:', err)
        }
      } catch (err) {
        console.error('Error deleting file:', err)
        toast.error(err instanceof Error ? err.message : 'Failed to delete file')
      } finally {
        setIsDeleting(false)
      }
    },
    [taskId, viewMode, currentViewData, setState],
  )

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
    (path: string, isFolder: boolean = false) => {
      if (!repoUrl || !branchName) {
        toast.error('Repository URL or branch name not available')
        return
      }

      try {
        // Parse repo URL to get owner/repo
        const repoPath = repoUrl.replace('https://github.com/', '').replace(/\.git$/, '')
        // Use 'tree' for folders and 'blob' for files
        const pathType = isFolder ? 'tree' : 'blob'
        const githubUrl = `https://github.com/${repoPath}/${pathType}/${branchName}/${path}`
        window.open(githubUrl, '_blank', 'noopener,noreferrer')
      } catch (err) {
        console.error('Error opening GitHub URL:', err)
        toast.error(`Failed to open ${isFolder ? 'folder' : 'file'} on GitHub`)
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
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const handleDiscardChanges = useCallback(async () => {
    if (!fileToDiscard) return

    setIsDiscarding(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}/discard-file-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: fileToDiscard,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to discard changes')
      }

      toast.success('Changes discarded successfully')

      // Refresh the file list in the background
      try {
        const url = `/api/tasks/${taskId}/files?mode=${viewMode}`
        const fetchResponse = await fetch(url)
        const fetchResult = await fetchResponse.json()

        if (fetchResult.success) {
          const fetchedFiles = fetchResult.files || []
          const fetchedFileTree = fetchResult.fileTree || {}

          setState({
            [viewMode]: {
              files: fetchedFiles,
              fileTree: fetchedFileTree,
              expandedFolders: currentViewData.expandedFolders,
              fetchAttempted: true,
            },
          })
        }
      } catch (err) {
        console.error('Error refreshing file list:', err)
      }
    } catch (err) {
      console.error('Error discarding changes:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to discard changes')
    } finally {
      setIsDiscarding(false)
      setShowDiscardConfirm(false)
      setFileToDiscard(null)
    }
  }, [fileToDiscard, taskId, viewMode, currentViewData, setState])

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, path: string, type: 'file' | 'folder') => {
      // Only allow drag and drop in Files > Sandbox mode
      if (viewMode !== 'all-local') {
        e.preventDefault()
        return
      }

      e.stopPropagation() // Prevent folder toggle on drag start
      setIsDraggingActive(true)
      setDraggedItem({ path, type })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', path)
    },
    [viewMode],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null)
    setDropTarget(null)
    // Delay resetting isDraggingActive to prevent onClick from firing
    setTimeout(() => setIsDraggingActive(false), 50)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      // Only allow drag and drop in Files > Sandbox mode
      if (!draggedItem || viewMode !== 'all-local') {
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

      if (!draggedItem) {
        return
      }

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

  // Keyboard shortcut handler for copy/cut/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts in sandbox mode
      if (viewMode !== 'local' && viewMode !== 'all-local') return

      // Don't handle shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const isCmdOrCtrl = e.ctrlKey || e.metaKey

      // Copy (Cmd/Ctrl + C)
      if (isCmdOrCtrl && e.key === 'c' && selectedFile) {
        e.preventDefault()
        handleCopy(selectedFile)
      }

      // Cut (Cmd/Ctrl + X)
      if (isCmdOrCtrl && e.key === 'x' && selectedFile) {
        e.preventDefault()
        handleCut(selectedFile)
      }

      // Paste (Cmd/Ctrl + V)
      if (isCmdOrCtrl && e.key === 'v' && clipboardFile) {
        e.preventDefault()
        handlePaste()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, clipboardFile, selectedFile, handleCopy, handleCut, handlePaste])

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
        const isSelected = selectedFile === fullPath
        const isDragEnabled = viewMode === 'all-local' // Only allow drag in Files > Sandbox

        const folderElement = (
          <div
            draggable={isDragEnabled}
            onDragStart={(e) => handleDragStart(e, fullPath, 'folder')}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, fullPath)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, fullPath)}
            className={`flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-sm ${
              isSelected ? 'bg-card' : 'hover:bg-card/50'
            } ${isDropTarget ? 'bg-blue-500/20' : ''} ${isDragging ? 'opacity-50 cursor-move' : 'cursor-pointer'}`}
            onClick={() => {
              if (!isDraggingActive) {
                toggleFolder(fullPath)
                onFileSelect?.(fullPath, true)
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, fullPath)}
          >
            <div className="flex items-center gap-1 flex-shrink-0">
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              )}
            </div>
            <span className="text-xs md:text-sm font-medium truncate">{name}</span>
            {viewMode === 'all' && (
              <Lock className="w-2.5 h-2.5 md:w-3 md:h-3 text-muted-foreground flex-shrink-0 ml-auto" />
            )}
          </div>
        )

        return (
          <div key={fullPath}>
            <div style={{ position: 'relative' }}>
              {folderElement}
              {(isSandboxMode || isRemoteMode) && isFolderContextMenuOpen && contextMenuPosition && (
                <DropdownMenu
                  open={isFolderContextMenuOpen}
                  onOpenChange={(open) => {
                    if (!open) {
                      setContextMenuFile(null)
                      setContextMenuPosition(null)
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <div
                      style={{
                        position: 'fixed',
                        top: contextMenuPosition.y,
                        left: contextMenuPosition.x,
                        width: '1px',
                        height: '1px',
                        pointerEvents: 'none',
                      }}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom">
                    {isRemoteMode && (
                      <DropdownMenuItem onClick={() => handleOpenOnGitHub(fullPath, true)}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open on GitHub
                      </DropdownMenuItem>
                    )}
                    {isSandboxMode && (
                      <>
                        {viewMode === 'all-local' && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                onFileSelect?.(fullPath, true)
                                setShowNewFileDialog(true)
                              }}
                            >
                              <FilePlus className="w-4 h-4 mr-2" />
                              New File
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                onFileSelect?.(fullPath, true)
                                setShowNewFolderDialog(true)
                              }}
                            >
                              <FolderPlus className="w-4 h-4 mr-2" />
                              New Folder
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onClick={() => handlePaste(fullPath)} disabled={!clipboardFile}>
                          <Clipboard className="w-4 h-4 mr-2" />
                          Paste
                          <DropdownMenuShortcut>{isMac ? '⌘V' : 'Ctrl+V'}</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
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
        const isDragEnabled = viewMode === 'all-local' // Only allow drag in Files > Sandbox

        const fileElement = (
          <div
            draggable={isDragEnabled}
            onDragStart={(e) => handleDragStart(e, node.filename!, 'file')}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-sm ${
              isSelected ? 'bg-card' : 'hover:bg-card/50'
            } ${isCut || isDragging ? 'opacity-50' : ''} ${isDragging ? 'cursor-move' : 'cursor-pointer'}`}
            onClick={() => {
              if (!isDraggingActive) {
                onFileSelect?.(node.filename!, false)
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, node.filename!)}
          >
            <div className="flex items-center gap-1 flex-shrink-0">
              <File className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground flex-shrink-0" />
            </div>
            <span
              className={`text-xs md:text-sm flex-1 truncate ${
                viewMode === 'all-local' && node.status === 'added'
                  ? 'text-green-600'
                  : viewMode === 'all-local' && node.status === 'modified'
                    ? 'text-yellow-600'
                    : ''
              }`}
            >
              {name}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {(viewMode === 'local' || viewMode === 'remote') &&
                ((node.additions || 0) > 0 || (node.deletions || 0) > 0) && (
                  <div className="flex items-center gap-1 text-xs">
                    {(node.additions || 0) > 0 && <span className="text-green-600">+{node.additions}</span>}
                    {(node.deletions || 0) > 0 && <span className="text-red-600">-{node.deletions}</span>}
                  </div>
                )}
              {viewMode === 'all' && <Lock className="w-2.5 h-2.5 md:w-3 md:h-3 text-muted-foreground flex-shrink-0" />}
            </div>
          </div>
        )

        return (
          <div key={fullPath} style={{ position: 'relative' }}>
            {fileElement}
            {isContextMenuOpen && contextMenuPosition && (
              <DropdownMenu
                open={isContextMenuOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    setContextMenuFile(null)
                    setContextMenuPosition(null)
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <div
                    style={{
                      position: 'fixed',
                      top: contextMenuPosition.y,
                      left: contextMenuPosition.x,
                      width: '1px',
                      height: '1px',
                      pointerEvents: 'none',
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom">
                  {isRemoteMode && (
                    <DropdownMenuItem onClick={() => handleOpenOnGitHub(node.filename!)}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open on GitHub
                    </DropdownMenuItem>
                  )}
                  {isSandboxMode && (
                    <>
                      {viewMode === 'local' ? (
                        // Changes > Sandbox: Only show Discard Changes
                        <DropdownMenuItem
                          onClick={() => {
                            setFileToDiscard(node.filename!)
                            setShowDiscardConfirm(true)
                          }}
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Discard Changes
                        </DropdownMenuItem>
                      ) : (
                        // Files > Sandbox: Show all file operations
                        <>
                          <DropdownMenuItem onClick={() => handleCut(node.filename!)}>
                            <Scissors className="w-4 h-4 mr-2" />
                            Cut
                            <DropdownMenuShortcut>{isMac ? '⌘X' : 'Ctrl+X'}</DropdownMenuShortcut>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopy(node.filename!)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                            <DropdownMenuShortcut>{isMac ? '⌘C' : 'Ctrl+C'}</DropdownMenuShortcut>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePaste()} disabled={!clipboardFile}>
                            <Clipboard className="w-4 h-4 mr-2" />
                            Paste
                            <DropdownMenuShortcut>{isMac ? '⌘V' : 'Ctrl+V'}</DropdownMenuShortcut>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setFileToDelete(node.filename!)
                              setShowDeleteConfirm(true)
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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
          {/* Main Navigation Row */}
          <div className="py-2 flex items-center justify-between h-[46px]">
            {/* Changes / Files Navigation */}
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
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          error === 'SANDBOX_NOT_RUNNING' ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="text-sm text-muted-foreground">Sandbox is not running</div>
                <Button size="sm" onClick={handleStartSandbox} disabled={isStartingSandbox}>
                  {isStartingSandbox ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    'Start Sandbox'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-xs md:text-sm text-destructive">{error}</div>
            </div>
          )
        ) : files.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-xs md:text-sm text-muted-foreground">
              {viewMode === 'local'
                ? 'No changes in sandbox'
                : viewMode === 'remote'
                  ? 'No changes in PR'
                  : 'No files found'}
            </div>
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

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between gap-2 flex-shrink-0 pt-2">
        {/* Sync and Reset buttons for Sandbox Changes */}
        {viewMode === 'local' && files.length > 0 ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSyncDialog(true)}
              disabled={isSyncing || isResetting}
              className="text-xs"
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
              className="text-xs"
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
        ) : (
          <div />
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Show New File/Folder buttons only in Files > Sandbox mode */}
          {viewMode === 'all-local' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewFileDialog(true)}
                disabled={loading}
                className="h-7 w-7 p-0"
                title="New File"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewFolderDialog(true)}
                disabled={loading}
                className="h-7 w-7 p-0"
                title="New Folder"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Reset fetchAttempted to force refetch
              setState({
                [viewMode]: {
                  ...currentViewData,
                  fetchAttempted: false,
                },
              })
              fetchBranchFiles()
            }}
            disabled={loading}
            className="h-7 w-7 p-0"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Sync Changes Dialog */}
      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Changes</DialogTitle>
            <DialogDescription>Enter a commit message for syncing your changes to the remote branch.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="sync-commit-message">Commit Message</Label>
            <Input
              id="sync-commit-message"
              value={syncCommitMessage}
              onChange={(e) => setSyncCommitMessage(e.target.value)}
              placeholder="Sync local changes"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSyncChanges()
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSyncDialog(false)
                setSyncCommitMessage('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSyncChanges} disabled={isSyncing}>
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                'Sync Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                handleResetChanges()
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

      {/* New File Dialog */}
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              {selectedFile && files.some((f: FileChange) => f.filename.startsWith(selectedFile + '/'))
                ? `Creating file in: ${selectedFile}/`
                : 'Enter the name for the new file (e.g., src/utils/helper.ts).'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-file-name">File Name</Label>
            <Input
              id="new-file-name"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={
                selectedFile && files.some((f: FileChange) => f.filename.startsWith(selectedFile + '/'))
                  ? 'filename.ts'
                  : 'path/to/file.ts'
              }
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleCreateFile()
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFileDialog(false)
                setNewFileName('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={isCreatingFile || !newFileName.trim()}>
              {isCreatingFile ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create File'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              {selectedFile && files.some((f: FileChange) => f.filename.startsWith(selectedFile + '/'))
                ? `Creating folder in: ${selectedFile}/`
                : 'Enter the name for the new folder (e.g., src/components).'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-folder-name">Folder Name</Label>
            <Input
              id="new-folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={
                selectedFile && files.some((f: FileChange) => f.filename.startsWith(selectedFile + '/'))
                  ? 'foldername'
                  : 'path/to/folder'
              }
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleCreateFolder()
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFolderDialog(false)
                setNewFolderName('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
              {isCreatingFolder ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Folder'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{fileToDelete}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDeleteConfirm(false)
                setFileToDelete(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (fileToDelete) {
                  handleDelete(fileToDelete)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Changes Confirmation Dialog */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discard changes to &quot;{fileToDiscard}&quot;? This will revert the file to its
              last committed state and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDiscardConfirm(false)
                setFileToDiscard(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges} disabled={isDiscarding}>
              {isDiscarding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Discarding...
                </>
              ) : (
                'Discard Changes'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
