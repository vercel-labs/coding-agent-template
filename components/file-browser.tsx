'use client'

import { useState, useEffect } from 'react'
import { File, Folder, FolderOpen, Clock, GitBranch } from 'lucide-react'

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
  onFileSelect?: (filename: string) => void
  onFilesLoaded?: (filenames: string[]) => void
  selectedFile?: string
}

export function FileBrowser({ taskId, branchName, onFileSelect, onFilesLoaded, selectedFile }: FileBrowserProps) {
  const [files, setFiles] = useState<FileChange[]>([])
  const [fileTree, setFileTree] = useState<{ [key: string]: FileTreeNode }>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (branchName) {
      fetchBranchFiles()
    }
  }, [taskId, branchName])

  // Helper function to recursively collect all folder paths
  const getAllFolderPaths = (tree: { [key: string]: FileTreeNode }, basePath = ''): string[] => {
    const paths: string[] = []

    Object.entries(tree).forEach(([name, node]) => {
      const fullPath = basePath ? `${basePath}/${name}` : name

      if (node.type === 'directory') {
        paths.push(fullPath)
        if (node.children) {
          paths.push(...getAllFolderPaths(node.children, fullPath))
        }
      }
    })

    return paths
  }

  const fetchBranchFiles = async () => {
    if (!branchName) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${taskId}/files`)
      const result = await response.json()

      if (result.success) {
        const fetchedFiles = result.files || []
        setFiles(fetchedFiles)
        const fileTree = result.fileTree || {}
        setFileTree(fileTree)

        // Expand all folders by default
        const allFolderPaths = getAllFolderPaths(fileTree)
        setExpandedFolders(new Set(allFolderPaths))

        // Notify parent component with list of filenames
        if (onFilesLoaded && fetchedFiles.length > 0) {
          onFilesLoaded(fetchedFiles.map((f: FileChange) => f.filename))
        }
      } else {
        setError(result.error || 'Failed to fetch files')
      }
    } catch (err) {
      setError('Failed to fetch branch files')
    } finally {
      setLoading(false)
    }
  }

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

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
        return (
          <div key={fullPath}>
            <div
              className="flex items-center gap-2 px-2 md:px-3 py-1.5 hover:bg-card/50 cursor-pointer rounded-sm"
              onClick={() => toggleFolder(fullPath)}
            >
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              )}
              <span className="text-xs md:text-sm font-medium truncate">{name}</span>
            </div>
            {isExpanded && node.children && (
              <div className="ml-3 md:ml-4">{renderFileTree(node.children, fullPath)}</div>
            )}
          </div>
        )
      } else {
        // File node
        const isSelected = selectedFile === node.filename
        return (
          <div
            key={fullPath}
            className={`flex items-center gap-2 px-2 md:px-3 py-1.5 cursor-pointer rounded-sm ${
              isSelected ? 'bg-card' : 'hover:bg-card/50'
            }`}
            onClick={() => onFileSelect?.(node.filename!)}
          >
            <File className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs md:text-sm flex-1 truncate">{name}</span>
            {(node.additions || node.deletions) && (
              <div className="flex items-center gap-1 text-xs flex-shrink-0">
                {node.additions && node.additions > 0 && <span className="text-green-600">+{node.additions}</span>}
                {node.deletions && node.deletions > 0 && <span className="text-red-600">-{node.deletions}</span>}
              </div>
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-muted-foreground">Loading files...</div>
        ) : error ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-destructive">{error}</div>
        ) : files.length === 0 ? (
          <div className="p-3 md:p-4 text-center text-xs md:text-sm text-muted-foreground">No files changed</div>
        ) : (
          <div className="py-2">{renderFileTree(fileTree)}</div>
        )}
      </div>
    </div>
  )
}
