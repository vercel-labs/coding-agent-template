/**
 * {{WORKFLOW_TITLE}} Workflow Specification (V2)
 *
 * Single source of truth for the {{workflow_slug}} workflow.
 * Defines steps, schemas, dependencies, and execution endpoints.
 *
 * ## Spec-Driven Architecture
 *
 * This file is the **single source of truth** for the workflow. All other files
 * (types, components, routes) derive from this spec:
 *
 * - **Type Safety**: TypeScript types are inferred from Zod schemas using
 *   `z.infer<>` (see bottom of file)
 * - **Dependency Tracking**: The `dependsOn` array enforces step prerequisites
 *   (the orchestrator enforces this before allowing step execution)
 * - **Validation**: Input/output schemas validate AI responses and user inputs
 *   at runtime (analyze route validates outputs before returning)
 * - **Persistence**: The `persist` array specifies which output fields are saved
 *   to the database (used by CRUD routes)
 *
 * ## Pattern
 *
 * See reference implementations:
 * - `lib/workflows/ic-memo/spec.ts` - Investment memo workflow (7 steps)
 * - `lib/workflows/market-outlook/spec.ts` - Market analysis workflow (7 steps)
 * - `lib/workflows/loi/spec.ts` - Commercial real estate LOI workflow (7 steps)
 */

import { z } from "zod";

/**
 * Canonical spec export name used across the codebase.
 *
 * Note: we also export a workflow-specific alias (`{{WORKFLOW_SLUG_UPPER}}_SPEC`)
 * so consumers can opt into a more explicit constant name if desired.
 */
export const WORKFLOW_SPEC = {
  slug: "{{workflow_slug}}",
  title: "{{WORKFLOW_TITLE}}",
  description: "{{WORKFLOW_DESCRIPTION}}",

  /**
   * Ordered workflow steps
   */
  steps: [
    {
      id: "step1",
      label: "Step 1",
      description: "First step description",
      icon: "FileUp", // Lucide icon name

      // Input schema (Zod)
      inputSchema: z.object({
        exampleField: z.string().optional(),
      }),

      // Output schema (Zod)
      outputSchema: z.object({
        result: z.string(),
        confidence: z.number().min(0).max(1).optional(),
      }),

      // Dependencies (step IDs that must complete first)
      // The orchestrator enforces these: a step cannot run until
      // all dependencies are in `completedSteps`. Empty array = no dependencies.
      dependsOn: [],

      // Fields to persist in database
      persist: ["result", "confidence"],

      // Execution endpoint
      executeEndpoint: "/api/{{workflow_slug}}/analyze",
    },
    // Add more steps as needed...
    // {
    //   id: "step2",
    //   label: "Step 2",
    //   description: "Second step description",
    //   icon: "Sparkles",
    //
    //   inputSchema: z.object({
    //     previousResult: z.string(),
    //   }),
    //
    //   // NOTE: Prefer permissive output schemas for AI steps:
    //   // - `.passthrough()` on objects
    //   // - `.default([])` on arrays
    //   outputSchema: z
    //     .object({
    //       analysis: z.string().default(""),
    //       findings: z.array(z.string()).default([]),
    //     })
    //     .passthrough(),
    //
    //   dependsOn: ["step1"],
    //   persist: ["analysis", "findings"],
    //   executeEndpoint: "/api/{{workflow_slug}}/analyze",
    // },
  ],
} as const;

// Optional alias export for readability (workflow-local, so no global collisions).
export const {{WORKFLOW_SLUG_UPPER}}_SPEC = WORKFLOW_SPEC;

/**
 * Infer types from spec (Zod inference for type safety)
 *
 * These types are automatically derived from the Zod schemas above.
 * No manual type definitions needed - TypeScript infers everything.
 *
 * Usage in components:
 * - `StepInput<"step1">` - Input type for step1
 * - `StepOutput<"step1">` - Output type for step1
 * - `WorkflowStep` - Union of all step IDs ("step1" | "step2" | ...)
 */
export type WorkflowStep = (typeof WORKFLOW_SPEC.steps)[number]["id"];

export type StepInput<S extends WorkflowStep> = z.infer<
  Extract<(typeof WORKFLOW_SPEC.steps)[number], { id: S }>["inputSchema"]
>;

export type StepOutput<S extends WorkflowStep> = z.infer<
  Extract<(typeof WORKFLOW_SPEC.steps)[number], { id: S }>["outputSchema"]
>;
