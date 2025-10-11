import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, gte, and, isNull } from 'drizzle-orm'

const DAILY_TASK_LIMIT = 5

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
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
    .where(and(eq(tasks.userId, userId), gte(tasks.createdAt, today), isNull(tasks.deletedAt)))

  const count = tasksToday.length
  const remaining = Math.max(0, DAILY_TASK_LIMIT - count)
  const allowed = count < DAILY_TASK_LIMIT

  return {
    allowed,
    remaining,
    resetAt: tomorrow,
  }
}
