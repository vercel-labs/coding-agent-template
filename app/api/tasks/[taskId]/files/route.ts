import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOctokit } from '@/lib/github/client'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

interface FileChange {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  changes: number
}

interface FileTreeNode {
  type: 'file' | 'directory'
  filename?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  children?: { [key: string]: FileTreeNode }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get('mode') || 'remote' // 'local', 'remote', 'all', or 'all-local'

    // Get task from database and verify ownership (exclude soft-deleted)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      const response = NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
      return response
    }

    // Check if task has a branch assigned
    if (!task.branchName) {
      return NextResponse.json({
        success: true,
        files: [],
        fileTree: {},
        branchName: null,
      })
    }

    // Extract owner and repo from the repository URL
    const repoUrl = task.repoUrl
    if (!repoUrl) {
      return NextResponse.json({
        success: true,
        files: [],
        fileTree: {},
        branchName: task.branchName,
      })
    }

    // Get user's authenticated GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json(
        {
          success: false,
          error: 'GitHub authentication required. Please connect your GitHub account to view files.',
        },
        { status: 401 },
      )
    }

    // Parse GitHub repository URL to get owner and repo
    const githubMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!githubMatch) {
      console.error('Invalid GitHub URL format:', repoUrl)
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid repository URL format',
        },
        { status: 400 },
      )
    }

    const [, owner, repo] = githubMatch

    let files: FileChange[] = []

    // If mode is 'local', fetch changed files from the sandbox
    if (mode === 'local') {
      if (!task.sandboxId) {
        const response = NextResponse.json(
          {
            success: false,
            error: 'Sandbox is not running',
          },
          { status: 410 },
        )
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
        return response
      }

      try {
        const { getSandbox } = await import('@/lib/sandbox/sandbox-registry')
        const { Sandbox } = await import('@vercel/sandbox')

        let sandbox = getSandbox(taskId)

        // Try to reconnect if not in registry
        if (!sandbox) {
          const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
          const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
          const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID

          if (sandboxToken && teamId && projectId) {
            sandbox = await Sandbox.get({
              sandboxId: task.sandboxId,
              teamId,
              projectId,
              token: sandboxToken,
            })
          }
        }

        if (!sandbox) {
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Sandbox not found',
          })
        }

        // Run git status to get local changes
        const statusResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['status', '--porcelain'],
          cwd: PROJECT_DIR,
        })

        if (statusResult.exitCode !== 0) {
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Failed to get local changes',
          })
        }

        const statusOutput = await statusResult.stdout()
        const statusLines = statusOutput
          .trim()
          .split('\n')
          .filter((line) => line.trim())

        // First, check if remote branch exists to determine comparison base
        const lsRemoteResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['ls-remote', '--heads', 'origin', task.branchName],
          cwd: PROJECT_DIR,
        })
        const remoteBranchRef = `origin/${task.branchName}`
        const checkRemoteResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['rev-parse', '--verify', remoteBranchRef],
          cwd: PROJECT_DIR,
        })
        const remoteBranchExists = checkRemoteResult.exitCode === 0
        const compareRef = remoteBranchExists ? remoteBranchRef : 'HEAD'

        // Get diff stats using git diff --numstat
        const numstatResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['diff', '--numstat', compareRef],
          cwd: PROJECT_DIR,
        })
        const diffStats: Record<string, { additions: number; deletions: number }> = {}

        if (numstatResult.exitCode === 0) {
          const numstatOutput = await numstatResult.stdout()
          const numstatLines = numstatOutput
            .trim()
            .split('\n')
            .filter((line) => line.trim())

          for (const line of numstatLines) {
            const parts = line.split('\t')
            if (parts.length >= 3) {
              const additions = parseInt(parts[0]) || 0
              const deletions = parseInt(parts[1]) || 0
              const filename = parts[2]
              diffStats[filename] = { additions, deletions }
            }
          }
        }

        // Parse git status output and get stats for each file
        // Format: XY filename (where X = index, Y = worktree)
        const filePromises = statusLines.map(async (line) => {
          // Git status --porcelain format should be: XY<space>filename
          // Get status codes from first 2 characters
          const indexStatus = line.charAt(0)
          const worktreeStatus = line.charAt(1)

          // Get filename by skipping first 2 chars and trimming spaces
          // This handles both 'XY filename' and 'XY  filename' formats
          let filename = line.substring(2).trim()

          // Handle renamed files: "old_name -> new_name"
          if (indexStatus === 'R' || worktreeStatus === 'R') {
            const arrowIndex = filename.indexOf(' -> ')
            if (arrowIndex !== -1) {
              filename = filename.substring(arrowIndex + 4).trim()
            }
          }

          // Determine status based on both index and worktree
          let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified'
          if (indexStatus === 'R' || worktreeStatus === 'R') {
            status = 'renamed'
          } else if (indexStatus === 'A' || worktreeStatus === 'A' || (indexStatus === '?' && worktreeStatus === '?')) {
            status = 'added'
          } else if (indexStatus === 'D' || worktreeStatus === 'D') {
            status = 'deleted'
          } else if (indexStatus === 'M' || worktreeStatus === 'M') {
            status = 'modified'
          }

          // Get diff stats for this file
          let stats = diffStats[filename] || { additions: 0, deletions: 0 }

          // For untracked/new files (??), git diff doesn't include them
          // Count lines manually
          if (
            (indexStatus === '?' && worktreeStatus === '?') ||
            (indexStatus === 'A' && !stats.additions && !stats.deletions)
          ) {
            try {
              const wcResult = await sandbox.runCommand({
                cmd: 'wc',
                args: ['-l', filename],
                cwd: PROJECT_DIR,
              })
              if (wcResult.exitCode === 0) {
                const wcOutput = await wcResult.stdout()
                const lineCount = parseInt(wcOutput.trim().split(/\s+/)[0]) || 0
                stats = { additions: lineCount, deletions: 0 }
              }
            } catch (err) {
              console.error('Error counting lines for new file:', err)
            }
          }

          return {
            filename,
            status,
            additions: stats.additions,
            deletions: stats.deletions,
            changes: stats.additions + stats.deletions,
          }
        })

        files = await Promise.all(filePromises)
      } catch (error) {
        console.error('Error fetching local changes from sandbox:', error)

        // Check if it's a 410 error (sandbox not running)
        const is410Error =
          (error && typeof error === 'object' && 'status' in error && error.status === 410) ||
          (error &&
            typeof error === 'object' &&
            'response' in error &&
            typeof error.response === 'object' &&
            error.response !== null &&
            'status' in error.response &&
            (error.response as { status: number }).status === 410)

        if (is410Error) {
          // Clear sandbox info from database since it's no longer running
          try {
            await db
              .update(tasks)
              .set({
                sandboxId: null,
                sandboxUrl: null,
              })
              .where(eq(tasks.id, taskId))

            // Also remove from registry
            const { unregisterSandbox } = await import('@/lib/sandbox/sandbox-registry')
            unregisterSandbox(taskId)
          } catch (dbError) {
            console.error('Error clearing sandbox info:', dbError)
          }

          const response = NextResponse.json(
            {
              success: false,
              error: 'Sandbox is not running',
            },
            { status: 410 },
          )
          response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
          return response
        }

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to fetch local changes',
          },
          { status: 500 },
        )
      }
    } else if (mode === 'all-local') {
      // Get all files from local sandbox using find command
      if (!task.sandboxId) {
        const response = NextResponse.json(
          {
            success: false,
            error: 'Sandbox is not running',
          },
          { status: 410 },
        )
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
        return response
      }

      try {
        const { getSandbox } = await import('@/lib/sandbox/sandbox-registry')
        const { Sandbox } = await import('@vercel/sandbox')

        let sandbox = getSandbox(taskId)

        // Try to reconnect if not in registry
        if (!sandbox) {
          const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
          const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
          const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID

          if (sandboxToken && teamId && projectId) {
            sandbox = await Sandbox.get({
              sandboxId: task.sandboxId,
              teamId,
              projectId,
              token: sandboxToken,
            })
          }
        }

        if (!sandbox) {
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Sandbox not found',
          })
        }

        // Use find to list all files in the sandbox, excluding .git directory and common build directories
        const findResult = await sandbox.runCommand({
          cmd: 'find',
          args: [
            '.',
            '-type',
            'f',
            '-not',
            '-path',
            '*/.git/*',
            '-not',
            '-path',
            '*/node_modules/*',
            '-not',
            '-path',
            '*/.next/*',
            '-not',
            '-path',
            '*/dist/*',
            '-not',
            '-path',
            '*/build/*',
            '-not',
            '-path',
            '*/.vercel/*',
          ],
          cwd: PROJECT_DIR,
        })

        if (findResult.exitCode !== 0) {
          console.error('Failed to run find command')
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Failed to list files',
          })
        }

        const findOutput = await findResult.stdout()
        const fileLines = findOutput
          .trim()
          .split('\n')
          .filter((line) => line.trim() && line !== '.')
          .map((line) => line.replace(/^\.\//, '')) // Remove leading ./

        // Get git status to determine which files are added/modified
        const statusResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['status', '--porcelain'],
          cwd: PROJECT_DIR,
        })
        const changedFilesMap: Record<string, 'added' | 'modified' | 'deleted' | 'renamed'> = {}

        if (statusResult.exitCode === 0) {
          const statusOutput = await statusResult.stdout()
          const statusLines = statusOutput
            .trim()
            .split('\n')
            .filter((line) => line.trim())

          for (const line of statusLines) {
            const indexStatus = line.charAt(0)
            const worktreeStatus = line.charAt(1)
            let filename = line.substring(2).trim()

            // Handle renamed files
            if (indexStatus === 'R' || worktreeStatus === 'R') {
              const arrowIndex = filename.indexOf(' -> ')
              if (arrowIndex !== -1) {
                filename = filename.substring(arrowIndex + 4).trim()
              }
            }

            // Determine status
            let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified'
            if (indexStatus === 'R' || worktreeStatus === 'R') {
              status = 'renamed'
            } else if (
              indexStatus === 'A' ||
              worktreeStatus === 'A' ||
              (indexStatus === '?' && worktreeStatus === '?')
            ) {
              status = 'added'
            } else if (indexStatus === 'D' || worktreeStatus === 'D') {
              status = 'deleted'
            } else if (indexStatus === 'M' || worktreeStatus === 'M') {
              status = 'modified'
            }

            changedFilesMap[filename] = status
          }
        }

        files = fileLines.map((filename) => {
          const trimmedFilename = filename.trim()
          // Use the actual status from git if available, otherwise 'renamed' (which won't trigger coloring)
          const status = changedFilesMap[trimmedFilename] || ('renamed' as const)

          return {
            filename: trimmedFilename,
            status,
            additions: 0,
            deletions: 0,
            changes: 0,
          }
        })
      } catch (error) {
        console.error('Error fetching local files from sandbox:', error)

        // Check if it's a 410 error (sandbox not running)
        const is410Error =
          (error && typeof error === 'object' && 'status' in error && error.status === 410) ||
          (error &&
            typeof error === 'object' &&
            'response' in error &&
            typeof error.response === 'object' &&
            error.response !== null &&
            'status' in error.response &&
            (error.response as { status: number }).status === 410)

        if (is410Error) {
          // Clear sandbox info from database since it's no longer running
          try {
            await db
              .update(tasks)
              .set({
                sandboxId: null,
                sandboxUrl: null,
              })
              .where(eq(tasks.id, taskId))

            // Also remove from registry
            const { unregisterSandbox } = await import('@/lib/sandbox/sandbox-registry')
            unregisterSandbox(taskId)
          } catch (dbError) {
            console.error('Error clearing sandbox info:', dbError)
          }

          const response = NextResponse.json(
            {
              success: false,
              error: 'Sandbox is not running',
            },
            { status: 410 },
          )
          response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
          return response
        }

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to fetch local files',
          },
          { status: 500 },
        )
      }
    } else if (mode === 'all') {
      try {
        const treeResponse = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: task.branchName,
          recursive: 'true',
        })

        files = treeResponse.data.tree
          .filter((item) => item.type === 'blob' && item.path) // Only include files
          .map((item) => ({
            filename: item.path!,
            status: 'modified' as const, // Default status for all files view
            additions: 0,
            deletions: 0,
            changes: 0,
          }))
      } catch (error: unknown) {
        console.error('Error fetching repository tree:', error)
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Branch not found or still being created',
          })
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to fetch repository tree from GitHub',
          },
          { status: 500 },
        )
      }
    } else {
      // Original logic for 'remote' mode (PR changes)

      try {
        // First check if the branch exists
        try {
          await octokit.rest.repos.getBranch({
            owner,
            repo,
            branch: task.branchName,
          })
        } catch (branchError: unknown) {
          if (branchError && typeof branchError === 'object' && 'status' in branchError && branchError.status === 404) {
            // Branch doesn't exist yet (task is still processing)
            return NextResponse.json({
              success: true,
              files: [],
              fileTree: {},
              branchName: task.branchName,
              message: 'Branch is being created...',
            })
          } else {
            throw branchError
          }
        }

        // Try to get the comparison between the branch and main
        let comparison
        try {
          comparison = await octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: 'main',
            head: task.branchName,
          })
        } catch (mainError: unknown) {
          if (mainError && typeof mainError === 'object' && 'status' in mainError && mainError.status === 404) {
            // If main branch doesn't exist, try master
            try {
              comparison = await octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: 'master',
                head: task.branchName,
              })
            } catch (masterError: unknown) {
              if (
                masterError &&
                typeof masterError === 'object' &&
                'status' in masterError &&
                masterError.status === 404
              ) {
                // Neither main nor master exists, or head branch doesn't exist
                return NextResponse.json({
                  success: true,
                  files: [],
                  fileTree: {},
                  branchName: task.branchName,
                  message: 'No base branch found for comparison',
                })
              } else {
                throw masterError
              }
            }
          } else {
            throw mainError
          }
        }

        // Convert GitHub API response to our FileChange format
        files =
          comparison.data.files?.map((file) => ({
            filename: file.filename,
            status: file.status as 'added' | 'modified' | 'deleted' | 'renamed',
            additions: file.additions || 0,
            deletions: file.deletions || 0,
            changes: file.changes || 0,
          })) || []
      } catch (error: unknown) {
        console.error('Error fetching file changes from GitHub:', error)

        // If it's a 404 error, return empty results instead of failing
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Branch not found or still being created',
          })
        }

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to fetch file changes from GitHub',
          },
          { status: 500 },
        )
      }
    }

    // Build file tree from files
    const fileTree: { [key: string]: FileTreeNode } = {}

    for (const file of files) {
      addToFileTree(fileTree, file.filename, file)
    }

    const response = NextResponse.json({
      success: true,
      files,
      fileTree,
      branchName: task.branchName,
    })
    // Don't cache file listings as they change frequently
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  } catch (error) {
    console.error('Error fetching task files:', error)
    const response = NextResponse.json({ success: false, error: 'Failed to fetch task files' }, { status: 500 })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  }
}

function addToFileTree(tree: { [key: string]: FileTreeNode }, filename: string, fileObj: FileChange) {
  const parts = filename.split('/')
  let currentLevel = tree

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const isLastPart = i === parts.length - 1

    if (isLastPart) {
      // It's a file
      currentLevel[part] = {
        type: 'file',
        filename: fileObj.filename,
        status: fileObj.status,
        additions: fileObj.additions,
        deletions: fileObj.deletions,
        changes: fileObj.changes,
      }
    } else {
      // It's a directory
      if (!currentLevel[part]) {
        currentLevel[part] = {
          type: 'directory',
          children: {},
        }
      }
      currentLevel = currentLevel[part].children!
    }
  }
}
