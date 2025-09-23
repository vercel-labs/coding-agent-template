import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from './commands'

export async function pushChangesToBranch(
  sandbox: Sandbox,
  branchName: string,
  commitMessage: string,
): Promise<{ success: boolean; logs: string[]; pushFailed?: boolean }> {
  const logs: string[] = []

  try {
    // Check if there are any changes to commit
    const statusResult = await runCommandInSandbox(sandbox, 'git', ['status', '--porcelain'])

    if (!statusResult.output?.trim()) {
      logs.push('No changes to commit')
      return { success: true, logs }
    }

    logs.push('Changes detected, committing...')

    // Add all changes
    const addResult = await runCommandInSandbox(sandbox, 'git', ['add', '.'])
    if (!addResult.success) {
      logs.push(`Failed to add changes: ${addResult.error}`)
      return { success: false, logs }
    }

    // Commit changes
    const commitResult = await runCommandInSandbox(sandbox, 'git', ['commit', '-m', commitMessage])

    if (!commitResult.success) {
      logs.push(`Failed to commit changes: ${commitResult.error}`)
      return { success: false, logs }
    }

    logs.push('Changes committed successfully')

    // Push to remote branch
    const pushResult = await runCommandInSandbox(sandbox, 'git', ['push', 'origin', branchName])

    if (pushResult.success) {
      logs.push(`Successfully pushed changes to branch: ${branchName}`)
      return { success: true, logs }
    } else {
      const errorMsg = pushResult.error || 'Unknown error'
      logs.push(`Failed to push to branch ${branchName}: ${errorMsg}`)

      // Check if it's a permission issue
      if (errorMsg.includes('Permission') || errorMsg.includes('access_denied') || errorMsg.includes('403')) {
        logs.push(
          'Note: This appears to be a permission issue. The changes were committed locally but could not be pushed.',
        )
        logs.push('You may need to check repository permissions or authentication tokens.')
      }

      // Still return success since the work was completed, just couldn't push
      return { success: true, logs, pushFailed: true }
    }
  } catch (error: any) {
    logs.push(`Error pushing changes: ${error.message}`)
    return { success: false, logs }
  }
}

export async function shutdownSandbox(sandbox: Sandbox): Promise<{ success: boolean; error?: string }> {
  try {
    // Note: Vercel Sandbox automatically shuts down after timeout
    // No explicit shutdown method available in current SDK
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to shutdown sandbox' }
  }
}
