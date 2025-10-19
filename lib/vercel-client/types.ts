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
  billing?: Billing
  created?: string
  id: string
  name: string
  saml?: { enforced: boolean }
  slug: string
}

export interface CreateProjectRequest {
  name: string
  framework?: string
  gitRepository?: {
    repo: string // format: "owner/repo"
    type: 'github'
  }
}

export interface VercelProject {
  id: string
  name: string
  framework?: string
  accountId: string
  createdAt: number
  updatedAt: number
}

export type BillingPlan = 'hobby' | 'pro' | 'enterprise'

type BillingStatus = 'active' | 'trialing' | 'overdue' | 'canceled' | 'expired'

interface Billing {
  addons?: string | null
  email?: string
  language?: string | null
  name?: string | null
  overdue?: boolean | null
  period: { start: number; end: number } | null
  plan: BillingPlan
  platform?: 'stripe' | 'stripeTestMode'
  purchaseOrder?: string | null
  status?: BillingStatus
  trial: { start: number; end: number } | null
}
