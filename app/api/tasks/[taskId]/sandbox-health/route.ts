import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Fetch task to get sandbox info and verify ownership (exclude soft-deleted)
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task || task.length === 0) {
      return NextResponse.json({ status: 'not_found' })
    }

    const taskData = task[0]

    // Check if task has a sandbox
    if (!taskData.sandboxId || !taskData.sandboxUrl) {
      return NextResponse.json({
        status: 'not_available',
        message: 'Sandbox not created yet',
      })
    }

    // Check if sandbox is still alive
    try {
      const sandbox = await Sandbox.get({
        teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
        projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
        token: process.env.SANDBOX_VERCEL_TOKEN!,
        sandboxId: taskData.sandboxId,
      })

      if (!sandbox) {
        return NextResponse.json({
          status: 'stopped',
          message: 'Sandbox has stopped or expired',
        })
      }

      // Try to fetch from the sandbox to check if dev server is running
      try {
        const response = await fetch(taskData.sandboxUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })

        // Get content-length and check body
        const contentLength = response.headers.get('content-length')
        const body = await response.text()

        // Check for 200 with empty body (dev server not running)
        if (response.status === 200 && (contentLength === '0' || body.length === 0)) {
          return NextResponse.json({
            status: 'starting',
            message: 'Dev server is starting up',
          })
        }

        if (response.ok && body.length > 0) {
          return NextResponse.json({
            status: 'running',
            message: 'Sandbox and dev server are running',
          })
        } else if (response.status === 410 || response.status === 502) {
          // 410 Gone or 502 Bad Gateway means the sandbox has stopped
          return NextResponse.json({
            status: 'stopped',
            message: 'Sandbox has stopped or expired',
          })
        } else if (response.status >= 500) {
          return NextResponse.json({
            status: 'error',
            message: 'Dev server returned an error',
            statusCode: response.status,
          })
        } else if (response.status === 404 || response.status === 503) {
          return NextResponse.json({
            status: 'starting',
            message: 'Dev server is starting up',
          })
        } else {
          return NextResponse.json({
            status: 'starting',
            message: 'Dev server is initializing',
          })
        }
      } catch (fetchError) {
        // Network error - could mean sandbox is down or dev server hasn't started
        // Check if it's a network error vs timeout
        if (fetchError instanceof Error) {
          if (fetchError.name === 'TimeoutError' || fetchError.message.includes('timeout')) {
            return NextResponse.json({
              status: 'starting',
              message: 'Dev server is starting or not responding',
            })
          }
          // Other network errors likely mean sandbox is stopped
          return NextResponse.json({
            status: 'stopped',
            message: 'Cannot connect to sandbox',
          })
        }
        return NextResponse.json({
          status: 'starting',
          message: 'Checking dev server status...',
        })
      }
    } catch (sandboxError) {
      console.error('Sandbox.get() error:', sandboxError)
      return NextResponse.json({
        status: 'stopped',
        message: 'Sandbox no longer exists',
      })
    }
  } catch (error) {
    console.error('Error checking sandbox health:', error)
    return NextResponse.json({
      status: 'error',
      message: 'Failed to check sandbox health',
    })
  }
}
