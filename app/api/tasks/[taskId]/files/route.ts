import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOctokit } from '@/lib/github/client'
import { getServerSession } from '@/lib/session/get-server-session'

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
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
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
        return NextResponse.json({
          success: true,
          files: [],
          fileTree: {},
          branchName: task.branchName,
          message: 'Sandbox not available',
        })
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
        const statusResult = await sandbox.runCommand('git', ['status', '--porcelain'])

        if (statusResult.exitCode !== 0) {
          console.error('Failed to run git status')
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Failed to get local changes',
          })
        }

        const statusOutput = await statusResult.stdout()
        console.log('Git status output:', statusOutput)
        const statusLines = statusOutput
          .trim()
          .split('\n')
          .filter((line) => line.trim())

        // Parse git status output
        // Format: XY filename (where X = index, Y = worktree)
        files = statusLines.map((line) => {
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

          console.log('Parsed line:', { line, indexStatus, worktreeStatus, filename, status })

          return {
            filename,
            status,
            additions: 0, // Git status doesn't provide line counts
            deletions: 0,
            changes: 0,
          }
        })

        console.log('Found local changes:', files.length, files)
      } catch (error) {
        console.error('Error fetching local changes from sandbox:', error)

        // Check if it's a 410 error (sandbox not running)
        if (error && typeof error === 'object' && 'status' in error && error.status === 410) {
          return NextResponse.json(
            {
              success: false,
              error: 'Sandbox is not running',
            },
            { status: 410 },
          )
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
      // Get all files from local sandbox using git ls-files
      if (!task.sandboxId) {
        return NextResponse.json({
          success: true,
          files: [],
          fileTree: {},
          branchName: task.branchName,
          message: 'Sandbox not available',
        })
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

        // Use git ls-files to list all tracked files in the repository
        const lsFilesResult = await sandbox.runCommand('git', ['ls-files'])

        if (lsFilesResult.exitCode !== 0) {
          console.error('Failed to run git ls-files')
          return NextResponse.json({
            success: true,
            files: [],
            fileTree: {},
            branchName: task.branchName,
            message: 'Failed to list files',
          })
        }

        const lsFilesOutput = await lsFilesResult.stdout()
        console.log('Git ls-files output length:', lsFilesOutput.length)
        const fileLines = lsFilesOutput.trim().split('\n').filter((line) => line.trim())

        files = fileLines.map((filename) => ({
          filename: filename.trim(),
          status: 'modified' as const,
          additions: 0,
          deletions: 0,
          changes: 0,
        }))

        console.log('Found all local files')
      } catch (error) {
        console.error('Error fetching local files from sandbox:', error)
        
        // Check if it's a 410 error (sandbox not running)
        if (error && typeof error === 'object' && 'status' in error && error.status === 410) {
          return NextResponse.json(
            {
              success: false,
              error: 'Sandbox is not running',
            },
            { status: 410 },
          )
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

        console.log('Found all files in branch')
      } catch (error: unknown) {
        console.error('Error fetching repository tree:', error)
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          console.log('Branch or repository not found, returning empty file list')
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
            console.log('Branch does not exist yet, returning empty file list')
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
                console.log('Could not compare branches')
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

        console.log('Found changed files in branch')
      } catch (error: unknown) {
        console.error('Error fetching file changes from GitHub:', error)

        // If it's a 404 error, return empty results instead of failing
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          console.log(`Branch or repository not found, returning empty file list`)
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

    return NextResponse.json({
      success: true,
      files,
      fileTree,
      branchName: task.branchName,
    })
  } catch (error) {
    console.error('Error fetching task files:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch task files' }, { status: 500 })
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
