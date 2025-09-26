import { Sandbox } from '@vercel/sandbox'

// Global registry to track active sandboxes by task ID
const activeSandboxes = new Map<string, Sandbox>()

export function registerSandbox(taskId: string, sandbox: Sandbox): void {
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

    // The sandbox will be automatically destroyed by Vercel's infrastructure
    // No need to manually kill processes - destroying the sandbox kills everything
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to kill sandbox'
    return { success: false, error: errorMessage }
  }
}

export function getActiveSandboxCount(): number {
  return activeSandboxes.size
}
