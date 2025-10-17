import { atom } from 'jotai'

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

interface ViewModeData {
  files: FileChange[]
  fileTree: { [key: string]: FileTreeNode }
  expandedFolders: Set<string>
  fetchAttempted: boolean
  error: string | null
}

interface FileBrowserState {
  local: ViewModeData
  remote: ViewModeData
  all: ViewModeData
  'all-local': ViewModeData
  loading: boolean
  error: string | null
}

const emptyViewModeData: ViewModeData = {
  files: [],
  fileTree: {},
  expandedFolders: new Set<string>(),
  fetchAttempted: false,
  error: null,
}

const defaultState: FileBrowserState = {
  local: structuredClone(emptyViewModeData),
  remote: structuredClone(emptyViewModeData),
  all: structuredClone(emptyViewModeData),
  'all-local': structuredClone(emptyViewModeData),
  loading: false,
  error: null,
}

// Create a separate atom for each task's file browser state
export const fileBrowserStateFamily = atom<Record<string, FileBrowserState>>({})

// Helper to get state for a specific task
export const getTaskFileBrowserState = (taskId: string) =>
  atom(
    (get) => {
      const allStates = get(fileBrowserStateFamily)
      return allStates[taskId] || structuredClone(defaultState)
    },
    (get, set, update: Partial<FileBrowserState>) => {
      const allStates = get(fileBrowserStateFamily)
      const currentState = allStates[taskId] || structuredClone(defaultState)
      set(fileBrowserStateFamily, {
        ...allStates,
        [taskId]: { ...currentState, ...update },
      })
    },
  )
