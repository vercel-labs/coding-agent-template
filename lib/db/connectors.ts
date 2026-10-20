import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from './client'
import { connectors } from './schema'

// Both new tasks and follow-ups must honor the user's current disconnect/delete controls.
export async function getConnectedConnectors(userId: string) {
  return db
    .select()
    .from(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.status, 'connected')))
}
