import { atomWithStorage } from 'jotai/utils'

// Task prompt that persists in localStorage
export const taskPromptAtom = atomWithStorage('task-prompt', '')

