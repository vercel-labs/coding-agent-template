import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject } from './commands'
import { TaskLogger } from '@/lib/utils/task-logger'

export async function pushChangesToBranch(
  sandbox: Sandbox,
  branchName: string,
  commitMessage: string,
  logger: TaskLogger,
): Promise<{ success: boolean; pushFailed?: boolean }> {
  try {
    // Check if there are any changes to commit
    const statusResult = await runInProject(sandbox, 'git', ['status', '--porcelain'])

    if (!statusResult.output?.trim()) {
      await logger.info('No changes to commit')
      return { success: true }
    }

    await logger.info('Changes detected, committing...')

    // Add all changes
    const addResult = await runInProject(sandbox, 'git', ['add', '.'])
    if (!addResult.success) {
      await logger.info('Failed to add changes')
      if (addResult.error) {
        console.error('Git add error details')
        await logger.error('Git add failed')
      }
      return { success: false }
    }

    // Commit changes
    const commitResult = await runInProject(sandbox, 'git', ['commit', '-m', commitMessage])

    if (!commitResult.success) {
      await logger.info('Failed to commit changes')
      if (commitResult.error) {
        console.error('Commit error details')
        await logger.error('Commit failed')
      }
      return { success: false }
    }

    await logger.info('Changes committed successfully')

    // Push to remote branch
    const pushResult = await runInProject(sandbox, 'git', ['push', 'origin', branchName])

    if (pushResult.success) {
      await logger.info('Successfully pushed changes to branch')
      return { success: true }
    } else {
      const errorMsg = pushResult.error || 'Unknown error'
      await logger.info('Failed to push to branch')

      // Check if it's a permission issue
      if (errorMsg.includes('Permission') || errorMsg.includes('access_denied') || errorMsg.includes('403')) {
        await logger.info(
          'Note: This appears to be a permission issue. The changes were committed locally but could not be pushed.',
        )
        await logger.info('You may need to check repository permissions or authentication tokens.')
      }

      // Still return success since the work was completed, just couldn't push
      return { success: true, pushFailed: true }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    await logger.info('Error pushing changes')
    return { success: false }
  }
}

export async function shutdownSandbox(sandbox?: Sandbox): Promise<{ success: boolean; error?: string }> {
  try {
    if (!sandbox) {
      return { success: true }
    }

    // 1. Best-effort process cleanup to allow graceful shutdown (run in parallel)
    try {
      await Promise.allSettled([
        runCommandInSandbox(sandbox, 'pkill', ['-f', 'node']),
        runCommandInSandbox(sandbox, 'pkill', ['-f', 'python']),
        runCommandInSandbox(sandbox, 'pkill', ['-f', 'npm']),
        runCommandInSandbox(sandbox, 'pkill', ['-f', 'yarn']),
        runCommandInSandbox(sandbox, 'pkill', ['-f', 'pnpm']),
      ])
    } catch {
      // Process cleanup is best-effort, continue to sandbox.stop()
    }

    // 2. Explicit sandbox.stop() - releases Vercel resources immediately
    // This is critical for cost control - without it, sandbox continues running
    // until Vercel's hard timeout, wasting compute resources
    try {
      await sandbox.stop()
    } catch (stopError) {
      // Handle 410 Gone - sandbox already expired (common and expected)
      if (stopError instanceof Error && (stopError.message.includes('410') || stopError.message.includes('Gone'))) {
        return { success: true }
      }
      // Log but don't fail - sandbox may auto-terminate
      console.error('Sandbox stop via SDK failed')
    }

    return { success: true }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to shutdown sandbox'
    return { success: false, error: errorMessage }
  }
}
