import 'server-only'

import { db } from '@/lib/db/client'
import { keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { decrypt } from '@/lib/crypto'

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

/**
 * Internal helper function to fetch and decrypt API keys from the database.
 * This is a private implementation detail - use getUserApiKeys() or getUserApiKey() instead.
 *
 * @param userId - The user's internal ID
 * @returns Object with all API keys (user keys override system env vars)
 * @private
 */
async function _fetchKeysFromDatabase(userId: string): Promise<{
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
      // Skip keys that fail to decrypt (keeps env var fallback)
      if (decryptedValue === null) return

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
 * Get all API keys for a user.
 * Returns an object containing all available API keys (OpenAI, Gemini, Cursor, Anthropic, AI Gateway).
 * User-provided keys override system environment variables.
 *
 * @param userId - Optional user ID for API token authentication. If not provided, uses current session.
 * @returns Object with provider names mapped to decrypted API key values (or undefined if not set)
 *
 * @example
 * // With session authentication
 * const keys = await getUserApiKeys()
 * console.log(keys.ANTHROPIC_API_KEY)
 *
 * @example
 * // With API token authentication
 * const keys = await getUserApiKeys('user-123')
 * console.log(keys.OPENAI_API_KEY)
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
    return _fetchKeysFromDatabase(userId)
  }

  // Otherwise, try to get userId from session
  const session = await getServerSession()
  if (!session?.user?.id) {
    return systemKeys
  }

  return _fetchKeysFromDatabase(session.user.id)
}

/**
 * Get a single API key for a specific provider.
 * More efficient than getUserApiKeys() when you only need one key.
 * User-provided key overrides system environment variable.
 *
 * @param provider - The API key provider ('openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway')
 * @param userId - Optional user ID for API token authentication. If not provided, uses current session.
 * @returns The decrypted API key value, or undefined if not set
 *
 * @example
 * // With session authentication
 * const anthropicKey = await getUserApiKey('anthropic')
 *
 * @example
 * // With API token authentication
 * const openaiKey = await getUserApiKey('openai', 'user-123')
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
      const decrypted = decrypt(userKey[0].value)
      // Only return if decryption succeeded, otherwise fall back to system key
      if (decrypted !== null) return decrypted
    }
  } catch (error) {
    console.error('Error fetching user API key')
  }

  return systemKeys[provider]
}
