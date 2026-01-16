'use client'

// @ts-nocheck
/* eslint-disable */

/**
 * {{WORKFLOW_TITLE}} Workflow Page (Client)
 *
 * Orchestrates the {{workflow_slug}} workflow using the spec-driven V2 architecture,
 * with the unified `WorkflowContainer` + `useWorkflowOrchestrator` runtime.
 *
 * Pattern: See `components/workflows/workflow-container.tsx` (contract + example).
 */

import { useCallback, useMemo } from 'react'
import { WorkflowContainer, type StepRenderProps } from '@/components/workflows/workflow-container'
import { WORKFLOW_SPEC, type StepInput, type StepOutput } from '@/lib/workflows/{{workflow_slug}}/spec'
import type { WorkflowState, WorkflowStep } from '@/lib/workflows/{{workflow_slug}}/types'
import type { AuthSession } from '@/lib/auth/types'
import { getWorkflowDefaultModelId, getWorkflowEffectiveSession } from '@/lib/workflows/utils'
import { Step1 } from '@/components/{{workflow_slug}}/step1'

export default function WorkflowClient({
  session,
  showDiagnostics = false,
}: {
  session: AuthSession | null
  showDiagnostics?: boolean
}) {
  const effectiveSession = getWorkflowEffectiveSession(session)
  const defaultWorkflowModelId = getWorkflowDefaultModelId(effectiveSession)

  const initialState = useMemo<WorkflowState>(
    () => ({
      currentStep: WORKFLOW_SPEC.steps[0].id as WorkflowStep,
      completedSteps: [],
      selectedModelId: defaultWorkflowModelId,
      step1Input: { exampleField: '' },
      step1Output: null,
    }),
    [defaultWorkflowModelId],
  )

  const getStepInput = useCallback((state: WorkflowState, step: WorkflowStep): unknown => {
    if (step === 'step1') return state.step1Input
    return {}
  }, [])

  const setStepOutput = useCallback((prev: WorkflowState, step: WorkflowStep, output: unknown): WorkflowState => {
    if (step === 'step1') {
      return { ...prev, step1Output: output as StepOutput<'step1'> }
    }
    return prev
  }, [])

  const renderStep = useCallback((step: WorkflowStep, props: StepRenderProps<WorkflowState, WorkflowStep>) => {
    if (step === 'step1') {
      return (
        <Step1
          input={props.input as StepInput<'step1'>}
          output={props.output as StepOutput<'step1'> | null}
          onChange={(next) => props.onChange(next)}
          onRun={props.onRun}
          isRunning={props.isRunning}
          readOnly={props.readOnly}
        />
      )
    }

    return (
      <div className="text-muted-foreground">
        Unknown step: <span className="font-mono">{String(step)}</span>
      </div>
    )
  }, [])

  return (
    <WorkflowContainer<WorkflowState, WorkflowStep>
      spec={WORKFLOW_SPEC}
      endpoints={{ save: '/api/{{workflow_slug}}', analyze: '/api/{{workflow_slug}}/analyze' }}
      session={session}
      initialState={initialState}
      workflowSlug="{{workflow_slug}}"
      showDiagnostics={showDiagnostics}
      autoRunMode="simple"
      getStepInput={getStepInput}
      setStepOutput={setStepOutput}
      renderStep={renderStep}
    />
  )
}
