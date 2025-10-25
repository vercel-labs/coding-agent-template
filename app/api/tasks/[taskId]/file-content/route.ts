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
    // File might not exist in this ref
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
    const rawFilename = searchParams.get('filename')
    const mode = searchParams.get('mode') || 'remote' // 'local' or 'remote'

    if (!rawFilename) {
      return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 })
    }

    // Decode the filename (handles %40 -> @, etc.)
    const filename = decodeURIComponent(rawFilename)

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

    // Get user's authenticated GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json(
        {
          error: 'GitHub authentication required. Please connect your GitHub account to view files.',
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

      // For non-image binary files, return a special message
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

      // Check if this is a node_modules file - always read from sandbox
      const isNodeModulesFile = filename.includes('/node_modules/')

      let oldContent = ''
      let newContent = ''
      let isBase64 = false
      let fileFound = false

      // For mode='local', we need both remote (old) and sandbox (new) versions
      if (mode === 'local') {
        // Get old content from GitHub (remote branch)
        if (!isNodeModulesFile) {
          const remoteResult = await getFileContent(octokit, owner, repo, filename, task.branchName, isImage)
          oldContent = remoteResult.content
          isBase64 = remoteResult.isBase64
        }

        // Get new content from sandbox (local)
        if (task.sandboxId) {
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

            if (sandbox) {
              // Read file from sandbox
              const normalizedPath = filename.startsWith('/') ? filename.substring(1) : filename
              const catResult = await sandbox.runCommand({
                cmd: 'cat',
                args: [normalizedPath],
                cwd: PROJECT_DIR,
              })

              if (catResult.exitCode === 0) {
                newContent = await catResult.stdout()
                fileFound = true
              }
            }
          } catch (sandboxError) {
            console.error('Error reading from sandbox:', sandboxError)
          }
        }

        if (!fileFound) {
          return NextResponse.json(
            {
              error: 'File not found in sandbox',
            },
            { status: 404 },
          )
        }
      } else {
        // For mode='remote' (default), behave as before
        let content = ''

        // For node_modules files, read directly from sandbox (they're not in GitHub)
        if (isNodeModulesFile && task.sandboxId) {
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

            if (sandbox) {
              // Read file from sandbox
              const normalizedPath = filename.startsWith('/') ? filename.substring(1) : filename
              const catResult = await sandbox.runCommand('cat', [normalizedPath])

              if (catResult.exitCode === 0) {
                content = await catResult.stdout()
                fileFound = true
              } else {
                console.error('Failed to read node_modules file from sandbox')
              }
            }
          } catch (sandboxError) {
            console.error('Error reading node_modules file from sandbox:', sandboxError)
          }
        } else {
          // For regular files, try GitHub first
          const result = await getFileContent(octokit, owner, repo, filename, task.branchName, isImage)
          content = result.content
          isBase64 = result.isBase64
          // If we got content from GitHub, mark as found
          if (content || isImage) {
            fileFound = true
          }
        }

        // If file not found in GitHub and we have a sandbox, try reading from sandbox (fallback for new files)
        if (!fileFound && !isImage && !isNodeModulesFile && task.sandboxId) {
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

            if (sandbox) {
              // Read file from sandbox
              const normalizedPath = filename.startsWith('/') ? filename.substring(1) : filename
              const catResult = await sandbox.runCommand('cat', [normalizedPath])

              if (catResult.exitCode === 0) {
                content = await catResult.stdout()
                fileFound = true
              }
            }
          } catch (sandboxError) {
            console.error('Error reading from sandbox:', sandboxError)
            // Continue to return 404 below
          }
        }

        if (!fileFound && !isImage) {
          return NextResponse.json(
            {
              error: 'File not found in branch',
            },
            { status: 404 },
          )
        }

        // Set old and new content for remote mode
        oldContent = ''
        newContent = content
      }

      // Return file content with appropriate oldContent and newContent
      return NextResponse.json({
        success: true,
        data: {
          filename,
          oldContent,
          newContent,
          language: getLanguageFromFilename(filename),
          isBinary: false,
          isImage,
          isBase64,
        },
      })
    } catch (error: unknown) {
      console.error('Error fetching file content from GitHub:', error)
      return NextResponse.json({ error: 'Failed to fetch file content from GitHub' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in file-content API:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
