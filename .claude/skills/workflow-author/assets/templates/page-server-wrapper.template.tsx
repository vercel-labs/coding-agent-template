import { getWorkflowPageSession } from "@/lib/workflows/page";
import WorkflowClient from "./{{workflow_slug}}-client";
import { WorkflowErrorBoundary } from "@/components/workflows/workflow-error-boundary";

/**
 * {{WORKFLOW_TITLE}} Workflow Page (Server Wrapper)
 *
 * Server Component that:
 * - Fetches authentication session
 * - Determines diagnostics visibility for admins
 * - Wraps client orchestrator in error boundary
 *
 * Pattern: See app/(chat)/workflows/loi/page.tsx
 */
export default async function {{WORKFLOW_TITLE_PASCAL}}Page() {
  const { session, showDiagnostics } = await getWorkflowPageSession();

  return (
    <WorkflowErrorBoundary>
      <WorkflowClient
        session={session}
        showDiagnostics={showDiagnostics}
      />
    </WorkflowErrorBoundary>
  );
}
