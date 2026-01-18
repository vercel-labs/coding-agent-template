import { Sandbox } from '@vercel/sandbox'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Simplified sandbox registry since we now use Sandbox.get() to reconnect
 * This registry is only used for immediate operations within the same serverless execution
 */

// Temporary in-memory tracking for current execution only
const activeSandboxes = new Map<string, Sandbox>()

export function registerSandbox(taskId: string, sandbox: Sandbox, _keepAlive: boolean = false): void {
  // Note: keepAlive parameter kept for backward compatibility but not used
  // Real persistence happens via sandboxId in database
  activeSandboxes.set(taskId, sandbox)
}

export function unregisterSandbox(taskId: string): void {
  activeSandboxes.delete(taskId)
}

export function getSandbox(taskId: string): Sandbox | undefined {
  return activeSandboxes.get(taskId)
}

export async function killSandbox(taskId: string): Promise<{ success: boolean; error?: string }> {
  const sandbox = activeSandboxes.get(taskId)

  if (!sandbox) {
    // If no sandbox found for this specific task ID, check if there are any active sandboxes
    // This handles cases like "Try Again" where a new task ID is created but old sandbox is still running
    if (activeSandboxes.size > 0) {
      // Kill the first (oldest) active sandbox as a fallback
      const firstEntry = activeSandboxes.entries().next().value
      if (firstEntry) {
        const [oldTaskId] = firstEntry
        activeSandboxes.delete(oldTaskId)
        return { success: true, error: `Killed sandbox for task ${oldTaskId} (fallback)` }
      }
    }
    return { success: false, error: 'No active sandbox found for this task' }
  }

  try {
    // Remove from registry immediately
    activeSandboxes.delete(taskId)

    // Stop the sandbox using the SDK
    try {
      await sandbox.stop()
    } catch (stopError) {
      // Sandbox may already be stopped, that's okay
      console.log('Sandbox stop completed or was already stopped')
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to kill sandbox'
    return { success: false, error: errorMessage }
  }
}

export function getActiveSandboxCount(): number {
  return activeSandboxes.size
}

/**
 * Stop sandbox by fetching sandboxId from database and reconnecting to it
 * Works across serverless invocations since it queries the DB for sandbox ID
 */
export async function stopSandboxFromDB(taskId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get sandbox ID from database
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!task?.sandboxId) {
      return { success: false, error: 'No sandbox ID found for task' }
    }

    // 2. Try to reconnect and stop the sandbox
    const sandbox = await Sandbox.get({
      sandboxId: task.sandboxId,
      teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: process.env.SANDBOX_VERCEL_TOKEN!,
    })

    // 3. Stop the sandbox
    await sandbox.stop()

    // 4. Also remove from in-memory registry if present
    unregisterSandbox(taskId)

    return { success: true }
  } catch (error) {
    // Handle 410 Gone - sandbox already expired
    if (error instanceof Error && (error.message.includes('410') || error.message.includes('Gone'))) {
      unregisterSandbox(taskId)
      return { success: true, error: 'Sandbox already expired' }
    }
    return { success: false, error: 'Failed to stop sandbox' }
  }
}

/**
 * Check if a sandbox is healthy by running a lightweight command
 * Returns true if sandbox responds, false if expired (410) or unreachable
 */
export async function isSandboxHealthy(sandbox: Sandbox): Promise<boolean> {
  try {
    // Run a simple command to verify sandbox is responsive
    const result = await sandbox.runCommand({
      cmd: 'true',
      args: [],
      sudo: false,
    })
    return result.exitCode === 0
  } catch (error) {
    // Check for 410 Gone error indicating sandbox expired
    if (error instanceof Error && (error.message.includes('410') || error.message.includes('Gone'))) {
      return false
    }
    // Other errors also indicate unhealthy sandbox
    return false
  }
}
