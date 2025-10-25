import { atomWithStorage } from 'jotai/utils'

interface NewlyCreatedRepo {
  owner: string
  repo: string
}

// Newly created repo tracking
export const newlyCreatedRepoAtom = atomWithStorage<NewlyCreatedRepo | null>('newly-created-repo', null)
