export interface SessionUserInfo {
  user: User | undefined
}

export interface Tokens {
  accessToken: string
  expiresAt?: number
  refreshToken?: string
}

export interface Session {
  created: number
  user: User
}

interface User {
  id: string
  username: string
  email: string | undefined
  avatar: string
  name?: string
  plan: BillingPlan
  highestTeamId?: string
}

type BillingPlan = 'hobby' | 'pro' | 'enterprise'
