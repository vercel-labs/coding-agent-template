import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOctokit } from '@/lib/github/client'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'
import type { Octokit } from '@octokit/rest'

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const langMap: { [key: string]: string } = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    sql: 'sql',
  }
  return langMap[ext || ''] || 'text'
}

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif']
  return imageExtensions.includes(ext || '')
}

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const binaryExtensions = [
    // Archives
    'zip',
    'tar',
    'gz',
    'rar',
    '7z',
    'bz2',
    // Executables
    'exe',
    'dll',
    'so',
    'dylib',
    // Databases
    'db',
    'sqlite',
    'sqlite3',
    // Media (non-image)
    'mp3',
    'mp4',
    'avi',
    'mov',
    'wav',
    'flac',
    // Documents
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    // Fonts
    'ttf',
    'otf',
    'woff',
    'woff2',
    'eot',
    // Other binary
    'bin',
    'dat',
    'dmg',
    'iso',
    'img',
  ]
  return binaryExtensions.includes(ext || '') || isImageFile(filename)
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  isImage: boolean,
): Promise<{ content: string; isBase64: boolean }> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if ('content' in response.data && typeof response.data.content === 'string') {
      // For images, return the base64 content as-is
      if (isImage) {
        return {
          content: response.data.content,
          isBase64: true,
        }
      }

      // For text files, decode from base64
      return {
        content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
        isBase64: false,
      }
    }

    return { content: '', isBase64: false }
  } catch (error: unknown) {
    // File might not exist in this ref (e.g., new file)
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return { content: '', isBase64: false }
    }
    throw error
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const searchParams = request.nextUrl.searchParams
    const filename = searchParams.get('filename')
    const mode = searchParams.get('mode') // 'local' or undefined (default: remote/PR diff)

    if (!filename) {
      return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 })
    }

    // Get task from database and verify ownership (exclude soft-deleted)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.branchName || !task.repoUrl) {
      return NextResponse.json({ error: 'Task does not have branch or repository information' }, { status: 400 })
    }

    // Handle local diff mode (git diff in sandbox)
    if (mode === 'local') {
      if (!task.sandboxId) {
        return NextResponse.json({ error: 'Sandbox not available' }, { status: 400 })
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
          return NextResponse.json({ error: 'Sandbox not found or inactive' }, { status: 400 })
        }

        // Fetch latest from remote to ensure we have up-to-date remote refs
        const fetchResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['fetch', 'origin', task.branchName],
          cwd: PROJECT_DIR,
        })

        // Check if remote branch actually exists (even if fetch succeeds, the branch might not exist)
        const remoteBranchRef = `origin/${task.branchName}`
        const checkRemoteResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['rev-parse', '--verify', remoteBranchRef],
          cwd: PROJECT_DIR,
        })
        const remoteBranchExists = checkRemoteResult.exitCode === 0

        if (!remoteBranchExists) {
          // Remote branch doesn't exist yet, compare against HEAD (local changes only)

          // Get old content (HEAD version)
          const oldContentResult = await sandbox.runCommand({
            cmd: 'git',
            args: ['show', `HEAD:${filename}`],
            cwd: PROJECT_DIR,
          })
          let oldContent = ''
          if (oldContentResult.exitCode === 0) {
            oldContent = await oldContentResult.stdout()
          }
          // File might not exist in HEAD (new file)

          // Get new content (working directory version)
          const newContentResult = await sandbox.runCommand({
            cmd: 'cat',
            args: [filename],
            cwd: PROJECT_DIR,
          })
          const newContent = newContentResult.exitCode === 0 ? await newContentResult.stdout() : ''

          return NextResponse.json({
            success: true,
            data: {
              filename,
              oldContent,
              newContent,
              language: getLanguageFromFilename(filename),
              isBinary: false,
              isImage: false,
            },
          })
        }

        // Compare working directory against remote branch
        // This shows all uncommitted AND unpushed changes
        const diffResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['diff', remoteBranchRef, filename],
          cwd: PROJECT_DIR,
        })

        if (diffResult.exitCode !== 0) {
          const diffError = await diffResult.stderr()
          console.error('Failed to get local diff:', diffError)
          return NextResponse.json({ error: 'Failed to get local diff' }, { status: 500 })
        }

        const diffOutput = await diffResult.stdout()

        // Get old content (remote branch version)
        const oldContentResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['show', `${remoteBranchRef}:${filename}`],
          cwd: PROJECT_DIR,
        })
        let oldContent = ''
        if (oldContentResult.exitCode === 0) {
          oldContent = await oldContentResult.stdout()
        }
        // File might not exist on remote (new file)

        // Get new content (working directory version)
        const newContentResult = await sandbox.runCommand({
          cmd: 'cat',
          args: [filename],
          cwd: PROJECT_DIR,
        })
        const newContent = newContentResult.exitCode === 0 ? await newContentResult.stdout() : ''

        return NextResponse.json({
          success: true,
          data: {
            filename,
            oldContent,
            newContent,
            language: getLanguageFromFilename(filename),
            isBinary: false,
            isImage: false,
          },
        })
      } catch (error) {
        console.error('Error getting local diff:', error)

        // Check if it's a 410 error (sandbox not running)
        if (error && typeof error === 'object' && 'status' in error && error.status === 410) {
          return NextResponse.json({ error: 'Sandbox is not running' }, { status: 410 })
        }

        return NextResponse.json({ error: 'Failed to get local diff' }, { status: 500 })
      }
    }

    // Get user's authenticated GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json(
        {
          error: 'GitHub authentication required. Please connect your GitHub account to view file diffs.',
        },
        { status: 401 },
      )
    }

    // Parse GitHub repository URL to get owner and repo
    const githubMatch = task.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!githubMatch) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
    }

    const [, owner, repo] = githubMatch

    try {
      // Check if file is an image or other binary
      const isImage = isImageFile(filename)
      const isBinary = isBinaryFile(filename)

      // For non-image binary files, return a special response
      if (isBinary && !isImage) {
        return NextResponse.json({
          success: true,
          data: {
            filename,
            oldContent: '',
            newContent: '',
            language: 'text',
            isBinary: true,
            isImage: false,
          },
        })
      }

      // Get file content from both base and head commits
      let oldContent = ''
      let newContent = ''
      let oldIsBase64 = false
      let newIsBase64 = false
      let baseRef = 'main'
      let headRef = task.branchName

      // For PRs (merged or open), use the exact base and head SHAs from the PR
      if (task.prNumber) {
        try {
          const prResponse = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: task.prNumber,
          })

          // Use the base commit SHA (what main was at PR creation time)
          baseRef = prResponse.data.base.sha
          // Use the head commit SHA (the PR branch before merge)
          headRef = prResponse.data.head.sha

          console.log('Using PR refs - base:', baseRef, 'head:', headRef)

          // Update merge commit SHA if merged and we don't have it
          if (prResponse.data.merged_at && prResponse.data.merge_commit_sha && !task.prMergeCommitSha) {
            await db
              .update(tasks)
              .set({
                prMergeCommitSha: prResponse.data.merge_commit_sha,
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, task.id))
          }
        } catch (error) {
          console.error('Failed to fetch PR data, falling back to branch comparison:', error)
          // Fall through to default branch comparison
        }
      }

      // Get old content from base ref
      try {
        const result = await getFileContent(octokit, owner, repo, filename, baseRef, isImage)
        oldContent = result.content
        oldIsBase64 = result.isBase64
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          // Try master if main doesn't work (only if we're using default branch names)
          if (baseRef === 'main') {
            try {
              const result = await getFileContent(octokit, owner, repo, filename, 'master', isImage)
              oldContent = result.content
              oldIsBase64 = result.isBase64
              baseRef = 'master'
            } catch (masterError: unknown) {
              if (
                !(
                  masterError &&
                  typeof masterError === 'object' &&
                  'status' in masterError &&
                  masterError.status === 404
                )
              ) {
                throw masterError
              }
              // File doesn't exist in base (could be a new file)
              oldContent = ''
              oldIsBase64 = false
            }
          } else {
            // File doesn't exist at this commit (new file)
            oldContent = ''
            oldIsBase64 = false
          }
        } else {
          throw error
        }
      }

      // Get new content from head ref
      try {
        const result = await getFileContent(octokit, owner, repo, filename, headRef, isImage)
        newContent = result.content
        newIsBase64 = result.isBase64
      } catch (error) {
        console.error('Error fetching new content from ref:', headRef, error)
        // File might have been deleted
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          newContent = ''
          newIsBase64 = false
        } else {
          throw error
        }
      }

      // Validate that we have content (at least one should be non-empty for a valid diff)
      if (!oldContent && !newContent) {
        return NextResponse.json(
          {
            error: 'File not found in either branch',
          },
          { status: 404 },
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          filename,
          oldContent: oldContent || '',
          newContent: newContent || '',
          language: getLanguageFromFilename(filename),
          isBinary: false,
          isImage,
          isBase64: newIsBase64,
        },
      })
    } catch (error: unknown) {
      console.error('Error fetching file content from GitHub:', error)
      return NextResponse.json({ error: 'Failed to fetch file content from GitHub' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in diff API:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
