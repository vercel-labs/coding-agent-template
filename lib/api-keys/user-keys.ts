import 'server-only'

import { db } from '@/lib/db/client'
import { keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { decrypt } from '@/lib/crypto'

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

/**
 * Get API keys for a user by their userId.
 * This is the core function that retrieves API keys.
 *
 * @param userId - The user's internal ID
 */
async function getApiKeysByUserId(userId: string): Promise<{
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
}> {
  // Default to system keys
  const apiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  }

  try {
    const userKeys = await db.select().from(keys).where(eq(keys.userId, userId))

    userKeys.forEach((key) => {
      const decryptedValue = decrypt(key.value)

      switch (key.provider) {
        case 'openai':
          apiKeys.OPENAI_API_KEY = decryptedValue
          break
        case 'gemini':
          apiKeys.GEMINI_API_KEY = decryptedValue
          break
        case 'cursor':
          apiKeys.CURSOR_API_KEY = decryptedValue
          break
        case 'anthropic':
          apiKeys.ANTHROPIC_API_KEY = decryptedValue
          break
        case 'aigateway':
          apiKeys.AI_GATEWAY_API_KEY = decryptedValue
          break
      }
    })
  } catch (error) {
    console.error('Error fetching user API keys')
    // Fall back to system keys on error
  }

  return apiKeys
}

/**
 * Get API keys for the currently authenticated user.
 * Returns user's keys if available, otherwise falls back to system env vars.
 *
 * @param userId - Optional userId for API token authentication (bypasses session lookup)
 */
export async function getUserApiKeys(userId?: string): Promise<{
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
}> {
  // Default to system keys
  const systemKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  }

  // If userId is provided directly, use it
  if (userId) {
    return getApiKeysByUserId(userId)
  }

  // Otherwise, try to get userId from session
  const session = await getServerSession()
  if (!session?.user?.id) {
    return systemKeys
  }

  return getApiKeysByUserId(session.user.id)
}

/**
 * Get a specific API key for a provider.
 * Returns user's key if available, otherwise falls back to system env var.
 *
 * @param provider - The API key provider
 * @param userId - Optional userId for API token authentication (bypasses session lookup)
 */
export async function getUserApiKey(provider: Provider, userId?: string): Promise<string | undefined> {
  // Default to system key
  const systemKeys = {
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    cursor: process.env.CURSOR_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    aigateway: process.env.AI_GATEWAY_API_KEY,
  }

  // Determine the userId to use
  let effectiveUserId: string | undefined = userId

  if (!effectiveUserId) {
    const session = await getServerSession()
    effectiveUserId = session?.user?.id
  }

  if (!effectiveUserId) {
    return systemKeys[provider]
  }

  try {
    const userKey = await db
      .select({ value: keys.value })
      .from(keys)
      .where(and(eq(keys.userId, effectiveUserId), eq(keys.provider, provider)))
      .limit(1)

    if (userKey[0]?.value) {
      return decrypt(userKey[0].value)
    }
  } catch (error) {
    console.error('Error fetching user API key')
  }

  return systemKeys[provider]
}
