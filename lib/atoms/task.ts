import { atomWithStorage } from 'jotai/utils'
import { atomFamily } from 'jotai/utils'

// Task prompt that persists in localStorage
export const taskPromptAtom = atomWithStorage('task-prompt', '')

// Per-task chat input that persists in localStorage
// Each task gets its own atom with its own localStorage key
export const taskChatInputAtomFamily = atomFamily((taskId: string) => atomWithStorage(`task-chat-input-${taskId}`, ''))
