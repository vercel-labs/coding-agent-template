import { atomWithStorage } from 'jotai/utils'
import { atomFamily } from 'jotai/utils'

interface GitHubOwner {
  login: string
  name: string
  avatar_url: string
}

interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
}

interface GitHubBranch {
  name: string
  protected: boolean
}

interface BranchCacheData {
  branches: GitHubBranch[]
  defaultBranch: string
}

// GitHub owners cache
export const githubOwnersAtom = atomWithStorage<GitHubOwner[] | null>('github-owners', null)

// Per-owner repos cache using atom family
export const githubReposAtomFamily = atomFamily((owner: string) =>
  atomWithStorage<GitHubRepo[] | null>(`github-repos-${owner}`, null),
)

// Per-repo branches cache using atom family (key: "owner/repo")
export const githubBranchesAtomFamily = atomFamily((repoFullName: string) =>
  atomWithStorage<BranchCacheData | null>(`github-branches-${repoFullName}`, null),
)
