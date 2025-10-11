import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOctokit } from '@/lib/github/client'
import { getServerSession } from '@/lib/session/get-server-session'
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

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if ('content' in response.data && typeof response.data.content === 'string') {
      return Buffer.from(response.data.content, 'base64').toString('utf-8')
    }

    return ''
  } catch (error: unknown) {
    // File might not exist in this ref (e.g., new file)
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return ''
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
      // Get file content from both main/master and the task branch
      let oldContent = ''
      let newContent = ''

      // Try to get content from main branch first, fallback to master
      try {
        oldContent = await getFileContent(octokit, owner, repo, filename, 'main')
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          try {
            oldContent = await getFileContent(octokit, owner, repo, filename, 'master')
          } catch (masterError: unknown) {
            if (
              !(masterError && typeof masterError === 'object' && 'status' in masterError && masterError.status === 404)
            ) {
              throw masterError
            }
            // File doesn't exist in main/master (could be a new file)
            oldContent = ''
          }
        } else {
          throw error
        }
      }

      // Get content from the task branch
      newContent = await getFileContent(octokit, owner, repo, filename, task.branchName)

      return NextResponse.json({
        success: true,
        data: {
          filename,
          oldContent,
          newContent,
          language: getLanguageFromFilename(filename),
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
