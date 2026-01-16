---
name: workflow-author
description: Create new standardized, scalable workflows in Orbis using the V2 spec-driven architecture. Use when the user requests creating a new multi-step AI-powered workflow, adding workflow features, or setting up workflow infrastructure. Covers Next.js 16, React 19, AI SDK 5, Zod schemas, shared runtime hooks (useRunId, useWorkflowSave, useWorkflowLoad, useWorkflowAnalyze, useWorkflowCitations), shared UI components, and the standardized workflow kit pattern.
---

# Workflow Author

Create standardized, scalable workflows for Orbis using the V2 spec-driven architecture.

## Quick Start

Use the scaffolding script to generate a complete workflow structure:

```bash
python .claude/skills/workflow-author/scripts/create_workflow.py <workflow-slug>
```

### Non-interactive usage (recommended for CI / agents)

The scaffolder can read a description from stdin or accept `--description`:

```bash
echo "My workflow description" | python .claude/skills/workflow-author/scripts/create_workflow.py <workflow-slug>
python .claude/skills/workflow-author/scripts/create_workflow.py <workflow-slug> --description "My workflow description"
```

This creates:

- `lib/workflows/<slug>/spec.ts` - Workflow specification (source of truth)
- `lib/workflows/<slug>/types.ts` - TypeScript types (optional, if Zod inference isn't enough)
- `app/(chat)/workflows/<slug>/page.tsx` - **Server wrapper** (fetches session, renders client with error boundary)
- `app/(chat)/workflows/<slug>/<slug>-client.tsx` - **Client** (preferred: configures `WorkflowContainer` + renders step components)
- `components/<slug>/*.tsx` - Step UI components (dumb components, receive `input`/`output`, call `onChange`/`onRun`)
- `app/api/<slug>/analyze/route.ts` - AI execution endpoint
- `app/api/<slug>/route.ts` - CRUD: list/create workflow runs
- `app/api/<slug>/[id]/route.ts` - CRUD: get/delete workflow run
- `lib/db/migrations/<next>_create_<slug>_runs_table.sql` - App DB migration for workflow run persistence
- `docs/ai-sdk/workflows/<slug>/README.md` - Workflow documentation

It scaffolds the foundation for DB-backed persistence:

- It generates the migration for a `<slug>_runs` table.
- You still need to wire Drizzle persistence end-to-end by adding:
  - a Drizzle table in `lib/db/schema.ts`
  - query helpers in `lib/db/queries.ts`
  - then updating the CRUD routes to call those helpers (see `ic-memo` for a working example).

## Core Principles (V2 Architecture)

**Spec-Driven Design**: Single source of truth in `spec.ts` defines:

- Step ordering, prerequisites, and dependencies
- Input/output schemas (Zod)
- Persistence fields
- Execution endpoints

**Preferred architecture (Dec 2025+)**: Configure-and-compose via:

- `WorkflowContainer` (`components/workflows/workflow-container.tsx`) — reusable workflow UI + orchestration
- `useWorkflowOrchestrator` (`lib/workflows/runtime/use-workflow-orchestrator.ts`) — unified logic (run id, save/load, analyze, auto-run, citations, diagnostics)

**Legacy architecture (still present in existing workflows)**: Manual clients that wire hooks directly:
- `useRunId` - Run ID state management and adoption
- `useWorkflowSave` - Debounced autosave with deduplication
- `useWorkflowLoad` - Load workflow runs by ID
- `useWorkflowAnalyze` - Step execution with diagnostics
- `useWorkflowCitations` - Citation and web source management
- `useWorkflowNavigation` - Consistent workflow loading by ID with URL navigation
- `useWorkflowUrlLoading` - Load workflow state from URL `runId` parameter (prevents duplicate loads)

**Dumb Step Components**: Receive `input`/`output`, render UI, call `onChange(nextInput)` and `onRun()`.

- Prefer rendering steps via `WorkflowContainer`’s `renderStep(stepId, props)` callback.
- Use shared UI components from `components/workflows/*` for consistent layout.

**Shared UI Components** (from `components/workflows/*`):
- `WorkflowPageShell` - Layout wrapper enforcing standard structure
- `WorkflowProgressBar` - Progress indicator with status slots
- `WorkflowStepper` - Step navigation component
- `WorkflowStepCard` - Step content container
- `WorkflowReportCard` - Report/final step content with edit, copy, download, retry actions
- `WorkflowAutoSaveStatus` - Autosave status indicator
- `WorkflowAutoRunControls` - Auto-run toggle and controls
- `WorkflowActionsRow` - Standard action buttons (Back/Next/Run)
- `WorkflowStepTransition` - Reduced-motion-safe transitions
- `WorkflowDiagnosticsCard` - Admin diagnostics display
- `WorkflowModelSelector` - Model selection for workflows

See `components/workflows/WORKFLOW_LAYOUT_STANDARD.md` for layout contract.

**Standard Server Routes**:

- Persistence: `GET/POST /api/<slug>`, `GET/DELETE /api/<slug>/:id`
- Execution: `POST /api/<slug>/analyze` with `step`, `modelId`, `input`, `context`

**Exports (recommended)**:

- Keep the canonical deliverable as **Markdown** in workflow state (typically a final “report”/“memo” field).
- Prefer **client-side** exports:
  - PDF: `lib/pdf-export.ts` → `downloadAsPDF({ title, content, filename, includeMermaid, theme })`
  - LaTeX: `lib/latex-export.ts` → `downloadAsLatex({ title, content, filename, author, includeDate, citations, chatId, documentId })`
  - Word (optional): Word-compatible HTML in a Blob (`application/msword`)
  - Plain text (optional): markdown-to-text conversion + Blob download

**Auth convention**:

- All workflow API routes use `getServerAuth()` (App DB / Drizzle calls do not have Supabase RLS context).

**Current Date in Prompts**:

- **CRITICAL**: Always include the current date in workflow analysis prompts so the AI knows today's date when generating documents or making date-sensitive decisions.
- Import `getCurrentDatePrompt` from `@/lib/ai/prompts/prompts`
- Add `${getCurrentDatePrompt()}\n\n` at the start of all step analysis prompts (draft, report, QC, etc.)
- This ensures AI-generated documents have correct dates and the AI can make accurate date-based decisions
- For document metadata dates (`generatedAt`, `lastModified`, `completedAt`), always set programmatically using `new Date().toISOString()` instead of letting the AI generate them
- This prevents incorrect dates like "10/4/2024" when the actual date is December 20, 2025

**Model Selection Rules**:

- **NEVER hardcode AI model IDs** - All AI model IDs must be defined in `lib/ai/entitlements.ts` (user-facing) or `lib/ai/providers.ts` (internal/system)
- **Workflow default models**: Use `getWorkflowDefaultModelId(session)` from `lib/workflows/utils.ts` (entitlements-aware, no hardcoded model IDs)
- **If no model specified**: Default to the user's entitlement default model
- **Exception**: Only use a different model if explicitly instructed by the user or in specific documented cases
- Never hardcode model IDs like `"xai/grok-4.1-fast-reasoning"` or `"anthropic/claude-haiku-4.5"` in workflow code

**Workflow helper utilities**:

- `getWorkflowPageSession()` (`lib/workflows/page.ts`) for session + diagnostics in workflow server wrappers.
- `getWorkflowDefaultModelId(session)` (`lib/workflows/utils.ts`) for entitlement-aware default model selection.
- `getWorkflowEffectiveSession(session)` when you need a guaranteed session shape in client orchestrators.
- `createWorkflowStepRegistry()` (`lib/workflows/step-registry.ts`) for dynamic step imports with SSR disabled.
- `useWorkflowNavigation()` (`lib/workflows/runtime/use-workflow-navigation.ts`) for consistent workflow loading by ID.
- `useWorkflowUrlLoading()` (`lib/workflows/runtime/use-workflow-url-loading.ts`) for loading workflow state from URL `runId` parameter.

**Persistence convention (App DB, Drizzle/Postgres)**:

- Workflows persist to the **app database** via Drizzle.
- Default pattern is a per-workflow runs table named `<slug>_runs`.
- Store `state` as `jsonb` + lightweight metadata (title/modelId).

**Dual DB rule (critical)**:

- App DB (Drizzle/Postgres) is for workflow run persistence.
- Supabase is used for storage/vector/literature retrieval only.
- Never mix these responsibilities.

## Template Reference

All templates are in `assets/templates/`:

1. **spec.template.ts** - Workflow specification with step definitions and Zod schemas
2. **types.template.ts** - TypeScript interfaces for workflow state (optional, Zod inference preferred)
3. **page-server-wrapper.template.tsx** - **Server wrapper** (fetches session, renders client with error boundary)
4. **page-client-orchestrator.template.tsx** - **Client** (preferred: configures `WorkflowContainer` + renders step components)
5. **analyze-route.template.ts** - AI execution API route with Zod validation
6. **crud-route.template.ts** - Create/list workflow runs
7. **crud-id-route.template.ts** - Get/delete workflow run
8. **step-component.template.tsx** - Individual step UI component (dumb component pattern)
9. **readme.template.md** - Workflow documentation
10. **migration-runs-table.template.sql** - App DB migration for `<slug>_runs`

**Templates include**:

- ✅ **Two-file pattern**: Server wrapper (`page.tsx`) + Client (`<slug>-client.tsx`)
- ✅ **Unified orchestration**: `WorkflowContainer` + `useWorkflowOrchestrator`
- ✅ **Shared UI primitives** are still used (internally by the container): `WorkflowPageShell`, `WorkflowProgressBar`, `WorkflowStepper`, `WorkflowActionsRow`, `WorkflowModelSelector`, etc.
- ✅ **Error boundary**: `WorkflowErrorBoundary` wrapping client component
- ✅ **AI SDK 5 patterns**: `robustGenerateObject` (schema repair), `streamText`, `tool()` with `inputSchema`
- ✅ **Schema validation**: `robustGenerateObject` from `@/lib/workflows/schema-repair` handles validation errors automatically
- ✅ **Auth**: `getWorkflowPageSession()` for server wrappers + `getServerAuth()` in API routes
- ✅ **Zod validation**: Input/output schemas in spec, validated in analyze route with schema repair fallback
- ✅ **Debounced persistence**: Autosave gated by first meaningful step output
- ✅ **Dual DB rule**: App DB for persistence, Supabase for vector/storage only
- ✅ **Current date in prompts**: Templates include `getCurrentDatePrompt()` import and usage in prompts

**The scaffolder generates both files** (`page.tsx` and `<slug>-client.tsx`) automatically.

## Full Workflow Guide

For architectural details, state management patterns, and advanced features, see:

**`references/workflow-authoring-guide.md`** - Complete V2 workflow authoring guide

**Current system documentation**:
- `docs/ai-sdk/workflows/WORKFLOW_SYSTEM_GUIDE.md` - Current workflow architecture and runtime contract
- `docs/ai-sdk/workflows/WORKFLOW_AUTHORING_GUIDE_V2.md` - Spec-driven workflow creation guide (recommended)

Key sections:

- Standard file/folder layout
- Orchestration (`WorkflowContainer` + `useWorkflowOrchestrator`) and how to implement step rendering
- Shared UI components (`WorkflowPageShell`, `WorkflowProgressBar`, `WorkflowStepper`, `WorkflowStepCard`, etc.)
- State management (simple vs XState)
- AI SDK 5 patterns (repo standard)
- Progress reporting patterns
- File ingestion standards
- Packaging for reuse across apps

## Quality Checklist

Before considering a workflow complete:

- [ ] `pnpm lint` - No ESLint errors
- [ ] `pnpm type-check` - TypeScript validates
- [ ] `pnpm verify:ai-sdk` - AI SDK 5 compatibility check (must pass if touching AI infrastructure)
- [ ] Auth protection on all API routes
- [ ] Zod validation on all inputs
- [ ] Step dependencies enforced
- [ ] Debounced autosave working
- [ ] Error states handled gracefully
- [ ] Documentation complete in `docs/ai-sdk/workflows/<slug>/README.md`
  - Includes workflow purpose + step list
  - Includes local run instructions + URL
  - Links to key files (`spec.ts`, `types.ts` if present, `page.tsx`, `<slug>-client.tsx`, `components/<slug>/*`, `app/api/<slug>/*`)
- [ ] Uses `WorkflowContainer` + `useWorkflowOrchestrator` for unified orchestration (preferred for new workflows)
- [ ] Shared UI components used (`WorkflowPageShell`, `WorkflowProgressBar`, `WorkflowStepper`, etc.)
- [ ] Follows layout standard from `components/workflows/WORKFLOW_LAYOUT_STANDARD.md`

## Common Patterns

**Simple Linear Workflow**: Steps execute in order, each depends on previous (most common pattern)
**Branching Workflow**: Use XState for conditional paths (advanced)
**Human-in-Loop**: Add approval steps with explicit state transitions
**Long-Running**: Stream progress via UI message stream protocol (optional)

**Current Implementation Patterns**:
- New workflows should use `WorkflowContainer` + `useWorkflowOrchestrator` for minimal boilerplate and consistent behavior
- Existing workflows may still be manual clients (legacy pattern), but should follow the same layout contract and persistence conventions
- Spec-driven V2 is recommended (ic-memo, market-outlook, loi)
- Paper-review uses hand-orchestrated pattern but still uses shared hooks
- All workflows use shared UI components from `components/workflows/*`

See existing workflows and guide for implementation examples.

## Lessons Learned & Common Pitfalls

### Template Customization (After Scaffolding)

**✅ Do This First**:

1. Customize `spec.ts` with your actual steps - this drives everything (single source of truth)
2. Review generated files - templates already include shared hooks and UI components
3. Update autosave gating in `<slug>-client.tsx` (condition: `state.step1Output !== null` or your first meaningful step)
4. Map step inputs/outputs in `<slug>-client.tsx` (`getCurrentStepInput()`, `setStepOutput()`)
5. Implement analyze route step functions with domain-specific prompts
6. Create/customize step components (or delegate to react-expert agent)
7. Wire up citation/web source integration if needed (`useWorkflowCitations` hook)
8. Add Drizzle schema and queries for persistence (scaffolder doesn't auto-edit shared files)
9. Run `pnpm type-check` early and often

**❌ Common Mistakes**:

- Using wrong import paths (templates are already correct)
- Generic AI prompts (customize for your domain)
- Forgetting to handle step dependencies
- Not validating API responses before storing in state
- Persisting workflow runs in-memory (Map) instead of Drizzle
- Saving a new run on every autosave (always store and reuse returned `id`)
- Mixing Supabase (vector/storage) with Drizzle (app DB)
- **Forgetting to include current date in prompts** - Always add `${getCurrentDatePrompt()}\n\n` at the start of analysis prompts
- **Letting AI generate document dates** - Always set `generatedAt`, `lastModified`, `completedAt` programmatically using `new Date().toISOString()`
- **Using raw `generateObject` instead of `robustGenerateObject`** - Always use `robustGenerateObject` from `@/lib/workflows/schema-repair` in analyze routes for automatic schema validation error handling

### Scaffolder Output

- ✅ Generates **both** `page.tsx` (server wrapper) and `<slug>-client.tsx` (client orchestrator)
- ✅ Includes all shared runtime hooks (`useRunId`, `useWorkflowSave`, `useWorkflowLoad`, `useWorkflowAnalyze`, `useWorkflowCitations`)
- ✅ Includes all shared UI components (`WorkflowPageShell`, `WorkflowProgressBar`, `WorkflowStepper`, etc.)
- ✅ Includes error boundary wrapping
- ✅ Includes model selector with entitlements
- ❌ Does **not** auto-edit `lib/db/schema.ts` or `lib/db/queries.ts` (shared files, requires manual wiring)

### Integration Patterns

**Academic Search**: Import `findRelevantContentSupabase` (and guard with `isSupabaseConfigured()`) from `@/lib/ai/supabase-retrieval`

```typescript
import {
  findRelevantContentSupabase,
  isSupabaseConfigured,
} from "@/lib/ai/supabase-retrieval";

if (!isSupabaseConfigured()) {
  return { papers: [], totalFound: 0 };
}

const results = await findRelevantContentSupabase(query, {
  matchCount: 10,
  rrfK: 60,
  minYear: 2020,
  maxYear: 2025,
  aiOnly: false,
});
```

**Web Search**:

- For workflow analyze routes, prefer the shared helper:
  - `searchWorkflowWebSources()` from `@/lib/workflows/web-search`
  - Optional: summarize those sources with `robustGenerateObject()` (`@/lib/workflows/schema-repair`) + `resolveLanguageModel(modelId)` (`@/lib/ai/providers`)
- For chat flows, use the `internetSearch` tool (requires a user toggle for cost control).

**Document Generation**: Import artifact handlers from `@/lib/artifacts/server`:
- `createDocumentHandler<T>()` - Create new artifacts (text, code, pdf, image, sheet)
- See `lib/artifacts/server.ts` for handler configuration patterns

### Production Readiness

**Before Deployment**:

- [ ] Confirm run persistence uses Drizzle + app DB
- [ ] Add proper error recovery and retry logic
- [ ] Implement streaming for long-running operations (>10s)
- [ ] Test with actual user entitlements and subscription tiers
- [ ] Add rate limiting for expensive AI operations

**Database Migration**:
See commented examples in `crud-route.template.ts` for schema and queries

### Time Estimates

| Task                        | Scaffolding | Customization | Total   |
| --------------------------- | ----------- | ------------- | ------- |
| Simple workflow (3 steps)   | 1 min       | 10-15 min     | ~15 min |
| Medium workflow (5 steps)   | 1 min       | 20-30 min     | ~30 min |
| Complex workflow (7+ steps) | 2 min       | 45-60 min     | ~60 min |

**Note**: Times assume familiarity with codebase and spec-driven architecture. Add 10-15 min for DB schema/queries wiring if not using in-memory persistence.

### Reference Workflows

For working examples of current workflow implementations, see:

- **IC Memo** (spec-driven V2): `lib/workflows/ic-memo/spec.ts` - 7-step investment memo workflow
- **Market Outlook** (spec-driven V2): `lib/workflows/market-outlook/spec.ts` - 7-step market analysis workflow
- **LOI** (spec-driven V2): `lib/workflows/loi/spec.ts` - 7-step commercial real estate LOI workflow
- **Paper Review** (hand-orchestrated): `lib/workflows/paper-review/types.ts` - 8-step academic review workflow (legacy pattern, still functional)

**Spec-driven V2 workflows** demonstrate:
- Complete spec definitions with Zod schemas (`spec.ts` as single source of truth)
- Step dependencies and persistence patterns
- Integration with shared runtime hooks
- Shared UI components from `components/workflows/*`
- Integration with academic search and web search
- Document generation and export patterns

**Paper Review** demonstrates:
- Hand-orchestrated step management (alternative pattern)
- Custom payload shape (`{ workflow, paperFileName }`)
- Still uses shared runtime hooks for consistency
