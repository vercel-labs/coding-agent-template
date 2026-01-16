/**
 * {{WORKFLOW_TITLE}} Workflow Types
 *
 * Type definitions for the {{workflow_slug}} workflow.
 * Use Zod inference from spec.ts when possible.
 * Only add types here if inference isn't sufficient.
 */

import type { WorkflowStep as SpecWorkflowStep } from './spec'
import type { StepInput, StepOutput } from './spec'

export type WorkflowStep = SpecWorkflowStep

/**
 * Complete workflow state
 */
export interface WorkflowState {
  /** Current step in the workflow */
  currentStep: WorkflowStep

  /** Completed steps */
  completedSteps: WorkflowStep[]

  /** Selected AI model for analysis */
  selectedModelId: string

  /** Step inputs/outputs (extend as you add steps) */
  step1Input: StepInput<'step1'>
  step1Output: StepOutput<'step1'> | null

  /** Metadata */
  createdAt?: string
  updatedAt?: string
}

/**
 * API request for step analysis
 */
export interface AnalysisRequest {
  /** Step being analyzed */
  step: WorkflowStep

  /** AI model ID to use */
  modelId: string

  /** Step-specific input */
  input: unknown

  /** Context from previous steps */
  context?: unknown
}

/**
 * API response for step analysis
 */
export interface AnalysisResponse<T = unknown> {
  /** Success status */
  success: boolean

  /** Analysis result */
  data?: T

  /** Error message if failed */
  error?: string
}

/**
 * Workflow run metadata (for persistence)
 */
export interface WorkflowRun {
  id: string
  userId: string
  state: WorkflowState
  createdAt: string
  updatedAt: string
}
