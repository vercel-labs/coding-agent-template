import 'server-only'

import { db } from './client'
import { users, accounts, type InsertUser } from './schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Find or create a user in the database
 * Returns the internal user ID (our generated ID, not the external auth provider ID)
 *
 * IMPORTANT: This checks if the externalId is already connected to an existing user via accounts
 * to prevent duplicate accounts when someone connects GitHub then later signs in with GitHub
 */
export async function upsertUser(
  userData: Omit<InsertUser, 'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt'>,
): Promise<string> {
  const { provider, externalId, accessToken, refreshToken, scope } = userData

  // First check: Does this exact provider + externalId combination exist as a primary account?
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.externalId, externalId)))
    .limit(1)

  if (existingUser.length > 0) {
    // User exists - update tokens, last login, and other fields that might have changed
    await db
      .update(users)
      .set({
        accessToken,
        refreshToken,
        scope,
        username: userData.username,
        email: userData.email,
        name: userData.name,
        avatarUrl: userData.avatarUrl,
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, existingUser[0].id))

    return existingUser[0].id
  }

  // Second check: Is this a GitHub account already connected to an existing user via accounts table?
  // This prevents duplicate accounts when someone:
  // 1. Signs in with Vercel
  // 2. Connects GitHub
  // 3. Later signs in directly with GitHub
  if (provider === 'github') {
    const existingAccount = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, externalId)))
      .limit(1)

    if (existingAccount.length > 0) {
      console.log(
        `[upsertUser] GitHub account (${externalId}) is already connected to user ${existingAccount[0].userId}. Using existing user.`,
      )

      // Update the existing user's last login
      await db
        .update(users)
        .set({
          updatedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, existingAccount[0].userId))

      return existingAccount[0].userId
    }
  }

  // User doesn't exist at all - create new
  const userId = nanoid()
  const now = new Date()

  await db.insert(users).values({
    id: userId,
    ...userData,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  })

  return userId
}

/**
 * Get user by internal ID
 */
export async function getUserById(userId: string) {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return result[0] || null
}

/**
 * Get user by auth provider and external ID
 */
export async function getUserByExternalId(provider: 'github' | 'vercel', externalId: string) {
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.externalId, externalId)))
    .limit(1)
  return result[0] || null
}

/**
 * Find user by GitHub account connection
 * Used to check if a GitHub account is already connected to a user
 */
export async function getUserByGitHubConnection(githubExternalId: string) {
  const result = await db
    .select({ user: users })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, githubExternalId)))
    .limit(1)
  return result[0]?.user || null
}
