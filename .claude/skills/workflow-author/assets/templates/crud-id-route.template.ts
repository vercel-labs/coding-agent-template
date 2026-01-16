/**
 * {{WORKFLOW_TITLE}} Individual Run API Route
 *
 * Handles individual workflow run operations:
 * - GET /api/{{workflow_slug}}/[id] - Get workflow run by ID
 * - DELETE /api/{{workflow_slug}}/[id] - Delete workflow run
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuth } from '@/lib/auth/server'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await getServerAuth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // TODO: Query database
    // const run = await db.query.workflowRuns.findFirst({
    //   where: and(
    //     eq(workflowRuns.id, id),
    //     eq(workflowRuns.userId, session.user.id)
    //   ),
    // });

    // TODO: Replace with Drizzle query helper scoped by userId.
    // const run = await getWorkflowRunById({ id, userId: session.user.id });
    const run: any | null = null

    if (!run) {
      return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: run })
  } catch (error) {
    console.error('Get run error:', error)
    return NextResponse.json({ success: false, error: 'Failed to get run' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await getServerAuth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // TODO: Delete from database
    // await db.delete(workflowRuns)
    //   .where(and(
    //     eq(workflowRuns.id, id),
    //     eq(workflowRuns.userId, session.user.id)
    //   ));

    // TODO: Replace with Drizzle delete helper.
    // const deleted = await deleteWorkflowRunById({ id, userId: session.user.id });
    const deleted = false

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete run error:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete run' }, { status: 500 })
  }
}
