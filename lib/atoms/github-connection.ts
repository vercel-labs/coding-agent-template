import { atom } from 'jotai'

export interface GitHubConnection {
  connected: boolean
  username?: string
  connectedAt?: Date
}

export const githubConnectionAtom = atom<GitHubConnection>({ connected: false })
export const githubConnectionInitializedAtom = atom(false)
