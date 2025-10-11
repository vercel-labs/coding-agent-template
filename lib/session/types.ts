export interface SessionUserInfo {
  user: User | undefined
  authProvider?: 'github' | 'vercel' // Which provider the user signed in with
}

export interface Tokens {
  accessToken: string
  expiresAt?: number
  refreshToken?: string
}

export interface Session {
  created: number
  authProvider: 'github' | 'vercel' // Which provider the user signed in with
  user: User
}

interface User {
  id: string // Internal user ID (from users table)
  username: string
  email: string | undefined
  avatar: string
  name?: string
}
