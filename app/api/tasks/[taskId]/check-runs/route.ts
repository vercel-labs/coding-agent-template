import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOctokit } from '@/lib/github/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get the task and verify it belongs to the user
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    // Check if task has a branch
    if (!task.branchName || !task.repoUrl) {
      return NextResponse.json({ success: false, error: 'Task does not have a branch' }, { status: 400 })
    }

    // Extract owner and repo from repoUrl
    const repoMatch = task.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!repoMatch) {
      return NextResponse.json({ success: false, error: 'Invalid repository URL' }, { status: 400 })
    }

    const [, owner, repo] = repoMatch

    // Get GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json({ success: false, error: 'GitHub authentication required' }, { status: 401 })
    }

    // Get the latest commit SHA for the branch
    let branchData
    try {
      branchData = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: task.branchName,
      })
    } catch (branchError) {
      if (branchError && typeof branchError === 'object' && 'status' in branchError && branchError.status === 404) {
        return NextResponse.json({
          success: true,
          checkRuns: [],
        })
      }
      throw branchError
    }

    const commitSha = branchData.data.commit.sha

    // Fetch check runs for the commit
    const { data: checkRunsData } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: commitSha,
    })

    return NextResponse.json({
      success: true,
      checkRuns: checkRunsData.check_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        started_at: run.started_at,
        completed_at: run.completed_at,
      })),
    })
  } catch (error) {
    console.error('Error fetching check runs:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch check runs' }, { status: 500 })
  }
}
