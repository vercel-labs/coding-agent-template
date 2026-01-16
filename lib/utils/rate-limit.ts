import { db } from '@/lib/db/client'
import { tasks, taskMessages } from '@/lib/db/schema'
import { eq, gte, and, isNull } from 'drizzle-orm'
import { getMaxMessagesPerDay } from '@/lib/db/settings'
import { ADMIN_MAX_MESSAGES_PER_DAY } from '@/lib/constants'
import { isAdminUser } from '@/lib/utils/admin-domains'
import type { Session } from '@/lib/session/types'

type RateLimitUser = Pick<Session['user'], 'id' | 'email'>

export async function checkRateLimit(
  user: RateLimitUser,
): Promise<{ allowed: boolean; remaining: number; total: number; resetAt: Date }> {
  // Get max messages per day for this user (user-specific > global > env var)
  const maxMessagesPerDay = isAdminUser(user) ? ADMIN_MAX_MESSAGES_PER_DAY : await getMaxMessagesPerDay(user.id)

  // Get start of today (UTC)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Get end of today (UTC)
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  // Count tasks created by this user today (excluding soft-deleted tasks)
  const tasksToday = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), gte(tasks.createdAt, today), isNull(tasks.deletedAt)))

  // Count user messages sent today across all tasks
  const userMessagesToday = await db
    .select()
    .from(taskMessages)
    .innerJoin(tasks, eq(taskMessages.taskId, tasks.id))
    .where(
      and(
        eq(tasks.userId, user.id),
        eq(taskMessages.role, 'user'),
        gte(taskMessages.createdAt, today),
        isNull(tasks.deletedAt),
      ),
    )

  // Total count includes both new tasks and follow-up messages
  const count = tasksToday.length + userMessagesToday.length
  const remaining = Math.max(0, maxMessagesPerDay - count)
  const allowed = count < maxMessagesPerDay

  return {
    allowed,
    remaining,
    total: maxMessagesPerDay,
    resetAt: tomorrow,
  }
}
