/**
 * Get the list of enabled authentication providers from environment variables
 * Defaults to GitHub only if not specified
 */
export function getEnabledAuthProviders(): {
  github: boolean
  vercel: boolean
} {
  const providers = process.env.NEXT_PUBLIC_AUTH_PROVIDERS || 'github'
  const enabledProviders = providers.split(',').map((p) => p.trim().toLowerCase())

  return {
    github: enabledProviders.includes('github'),
    vercel: enabledProviders.includes('vercel'),
  }
}
