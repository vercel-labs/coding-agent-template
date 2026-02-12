export interface VercelUser {
  avatar: string
  email: string
  name: string
  uid?: string
  id?: string
  username: string
}

export interface VercelTeam {
  avatar?: string
  created?: string
  id: string
  name: string
  saml?: { enforced: boolean }
  slug: string
}
