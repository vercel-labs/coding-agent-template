import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { octokit } from '@/lib/github/client'

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
    const { taskId } = await params

    // Get task from database
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

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
          console.log(`Branch ${task.branchName} doesn't exist yet, returning empty file list`)
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
              console.log(`Could not compare branches for ${task.branchName}`)
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
          additions: file.additions || undefined,
          deletions: file.deletions || undefined,
          changes: file.changes || 0,
        })) || []

      console.log(`Found ${files.length} changed files in branch ${task.branchName}`)
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
