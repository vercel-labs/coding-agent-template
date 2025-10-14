import { Sandbox } from '@vercel/sandbox'

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
