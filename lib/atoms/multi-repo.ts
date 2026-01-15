import { atom } from 'jotai'

export interface SelectedRepo {
  owner: string
  repo: string
  full_name: string
  clone_url: string
}

// Whether multi-repo mode is enabled
export const multiRepoModeAtom = atom<boolean>(false)

// Selected repos in multi-repo mode
export const selectedReposAtom = atom<SelectedRepo[]>([])
