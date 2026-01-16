const ADMIN_EMAIL_DOMAINS = (process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAINS ?? '')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean)
  .map((domain) => (domain.startsWith('@') ? domain : `@${domain}`))

export function getAdminEmailDomains(): string[] {
  return [...ADMIN_EMAIL_DOMAINS]
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) {
    return false
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail.includes('@')) {
    return false
  }

  return ADMIN_EMAIL_DOMAINS.some((domain) => normalizedEmail.endsWith(domain))
}

export function isAdminUser(user?: { email?: string | null } | null): boolean {
  return isAdminEmail(user?.email)
}
