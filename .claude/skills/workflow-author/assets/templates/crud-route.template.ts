/**
 * {{WORKFLOW_TITLE}} CRUD API Route
 *
 * Handles workflow run persistence:
 * - GET /api/{{workflow_slug}} - List user's workflow runs
 * - POST /api/{{workflow_slug}} - Create or update workflow run
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuth } from '@/lib/auth/server'
import type { WorkflowState } from '@/lib/workflows/{{workflow_slug}}/types'

export async function GET(_request: NextRequest) {
  try {
    const { session } = await getServerAuth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Replace with Drizzle query helper (App DB) scoped by userId.
    // Example pattern (see existing workflows like paper-review / ic-memo):
    // const runs = await getWorkflowRunsByUserId({ userId: session.user.id, limit: 20 });
    const runs: any[] = []

    return NextResponse.json({ success: true, data: runs })
  } catch (error) {
    console.error('List runs error:', error)
    return NextResponse.json({ success: false, error: 'Failed to list runs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session } = await getServerAuth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, state } = body as { id?: string; state: WorkflowState }

    if (!state) {
      return NextResponse.json({ success: false, error: 'Missing state' }, { status: 400 })
    }

    // TODO: Replace with Drizzle insert/update helper.
    // const result = await saveWorkflowRun({ id, userId: session.user.id, title, modelId: state.selectedModelId, state });
    const persistedId = id ?? crypto.randomUUID()
    return NextResponse.json({ success: true, data: { id: persistedId } })
  } catch (error) {
    console.error('Save run error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save run' }, { status: 500 })
  }
}
