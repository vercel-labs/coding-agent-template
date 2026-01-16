# Workflow Authoring Guide (V2) — Standardized, Scalable Workflows

This is a revised, more scalable approach for building workflows in Orbis.

It keeps the good parts of the Paper Review workflow (clear step UI, debounced persistence, typed outputs) but proposes a **more standardized architecture** so workflows:

- Share a consistent “shape” across the codebase
- Are easier to add, refactor, and maintain
- Can be reused in other applications with minimal changes
- Are **AI SDK 5-compatible** (repo standard)

**Repo reality check:** This repo is **AI SDK 5 only**. Do not introduce AI SDK 6 patterns here unless the repo explicitly migrates.

## Stack / dependencies (Orbis)

This guide assumes the Orbis stack and conventions:

- **App framework**
  - Next.js **16.0.10** (App Router)
  - React **19**
  - Turbopack (development/build)
- **AI**
  - Vercel AI SDK **5** (repo standard)
  - AI provider routing via **AI Gateway** (`AI_GATEWAY_API_KEY`)
- **Auth + storage + vector**
  - Supabase Auth
  - Supabase Storage (uploads)
  - Supabase Vector DB (separate from app DB)
- **App database**
  - Postgres + Drizzle (app DB)
- **UI**
  - Tailwind CSS **v4**
  - shadcn/ui components
- **Package manager**
  - pnpm **10.25.0**

---

## Executive summary: the better design

The key improvement is: **make workflows spec-driven**.

Instead of scattering workflow “truth” across:

- the orchestrator page
- step components
- analysis route switch statements
- ad-hoc persistence payloads

…define a single **Workflow Spec** that is the source of truth for:

- step ordering
- prerequisites
- input/output schemas (Zod)
- persistence fields
- server execution endpoints

Then use a shared **Workflow Runtime** to:

- render a consistent UI shell
- manage state transitions
- debounce autosave
- run steps
- standardize errors + progress reporting

This design maps well to Next.js App Router, React 19, Zod, Supabase Auth/DB, Tailwind v4/shadcn, Turbopack, and Vercel AI SDK.

---

## The Workflow Kit concept (recommended)

## Scaffolding with the Workflow Author skill (how it works in this repo)

The workflow-author skill’s scaffolding script is:

- `python .claude/skills/workflow-author/scripts/create_workflow.py <workflow-slug>`

Important behavior:

- The script validates the slug (kebab-case).
- The script prompts for a workflow description via stdin.
  - In non-interactive environments (common on Windows), you should pipe the description.

Examples:

```bash
echo "My workflow description" | python .claude/skills/workflow-author/scripts/create_workflow.py ic-memo
```

If you don’t pipe input and the environment can’t prompt, the script may exit with an error.

Scaffold output notes (repo-current):

- The scaffolder generates workflow UI + API stubs plus an **App DB migration** for a `<slug>_runs` table.
- The scaffolder does **not** auto-edit shared DB files (`lib/db/schema.ts`, `lib/db/queries.ts`). You still wire those manually (see `ic-memo` for the working reference).
- The templates live under `.claude/skills/.../assets/templates/` and are excluded from repo type-checking to avoid placeholder-related editor noise.

### 1) Workflow Spec (single source of truth)

Create a file:

- `lib/workflows/<workflow-slug>/spec.ts`

The spec should define:

- `slug`, `title`
- ordered `steps[]`
- per-step:
  - `id`
  - `label`, `description`
  - `inputSchema` (Zod)
  - `outputSchema` (Zod)
  - `dependsOn` (step IDs)
  - `persist` (list of output fields to persist)
  - `executeEndpoint` (API endpoint that runs the step)

The spec is what makes workflows “standard”.

### 2) Workflow Runtime (shared orchestrator logic)

**Current implementation** (already available):

- `lib/workflows/runtime/use-workflow-orchestrator.ts` - Unified orchestrator hook
- `components/workflows/workflow-container.tsx` - Complete workflow UI component

**Responsibilities** (handled by `useWorkflowOrchestrator`):

- Maintain a standardized in-memory state shape
- Enforce step prerequisites
- Provide a standard `runStep(stepId)` API
- Debounced autosave (configurable)
- Normalize server errors
- Provide a consistent progress model
- Citation/web source management
- URL loading from `runId` params
- Auto-run modes (simple, full, disabled)

**Usage**: New workflows should use `WorkflowContainer` which wraps `useWorkflowOrchestrator` internally. This eliminates 500+ lines of boilerplate per workflow.

### 3) Workflow UI Shell (standard layout)

Create a reusable shell component:

- `WorkflowPageShell` (`components/workflows/workflow-page-shell.tsx`)
- `WorkflowProgressBar` (`components/workflows/workflow-progress-bar.tsx`)
- `WorkflowStepper` (`components/workflows/workflow-stepper.tsx`)
- `WorkflowStepCard` (`components/workflows/workflow-step-card.tsx`)
- `WorkflowActionsRow` (`components/workflows/workflow-actions-row.tsx`)
- `WorkflowAutoSaveStatus` (`components/workflows/workflow-auto-save-status.tsx`) (recommended for `WorkflowProgressBar.leftSlot`)
- `WorkflowAutoRunControls` (`components/workflows/workflow-auto-run-controls.tsx`) (recommended for `WorkflowProgressBar.rightSlot`)
- `WorkflowStepTransition` (`components/workflows/workflow-step-transition.tsx`) (optional reduced-motion-safe step transition wrapper)

Layout contract reference:

- `components/workflows/WORKFLOW_LAYOUT_STANDARD.md`

It should render:

- title + description
- progress
- stepper navigation
- standard action bar (Back/Next, Run, Retry, Save status)

Styling note:

- Prefer workflow-owned Tailwind class clusters from `components/workflows/workflow-styles.ts` inside workflow UI primitives instead of introducing new global CSS.

Then each workflow only provides:

- the step content renderer
- any workflow-specific header extras

Standard helpers to use in new workflows:

- `getWorkflowPageSession()` (`lib/workflows/page.ts`) for session + diagnostics in `page.tsx`.
- `getWorkflowDefaultModelId(session)` (`lib/workflows/utils.ts`) for entitlement-aware default model selection.
- `getWorkflowEffectiveSession(session)` when you need a guaranteed session shape.
- `createWorkflowStepRegistry()` (`lib/workflows/step-registry.ts`) for dynamic step imports.
- `useWorkflowUrlLoading()` (`lib/workflows/runtime/use-workflow-url-loading.ts`) to handle loading workflows from URL `runId` params.
- `useWorkflowNavigation()` (`lib/workflows/runtime/use-workflow-navigation.ts`) to create consistent workflow navigation handlers.
- `robustGenerateObject()` (`lib/workflows/schema-repair.ts`) for automatic schema validation error handling, repair attempts, and fallback in analyze routes.

### 4) Step Components remain, but become “dumb”

Keep `components/<workflow-slug>/*`, but standardize them:

- They receive `input` and `output`
- They render an editor/view
- They call `onChange(output)` for edits
- They call `onRun()` to trigger server execution (provided by runtime)

This reduces per-workflow reinvention.

---

## Standard file/folder layout (V2)

For a workflow slug `grant-review`:

- **Spec**
  - `lib/workflows/grant-review/spec.ts`
- **Types** (only if needed beyond what the spec schemas can infer)
  - `lib/workflows/grant-review/types.ts`
- **Workflow UI entry**
  - `app/(chat)/workflows/grant-review/page.tsx` (Server Wrapper)
  - `app/(chat)/workflows/grant-review/grant-review-client.tsx` (Client using `WorkflowContainer`)
  - The server wrapper fetches auth session; the client provides step rendering + state mapping to the shared container.
- **Step UI**
  - `components/grant-review/*`
- **Server execution**
  - `app/api/grant-review/analyze/route.ts` (or `run/route.ts`)
- **Persistence**
  - `app/api/grant-review/route.ts`
  - `app/api/grant-review/[id]/route.ts`
- **Docs**
  - `docs/ai-sdk/workflows/grant-review/README.md`

This layout keeps per-workflow code grouped, but makes the orchestrator logic reusable.

---

## State management: when to use a state machine

**Baseline (simple workflows):**

- A single `WorkflowState` object + step list is fine (Paper Review model).

**Recommended for complex workflows:**

- Use a state machine (e.g. XState) _inside the runtime_ to model:
  - idle/running/error states
  - retries
  - branching
  - optional steps
  - human-in-the-loop approvals

Why machines help:

- Transitions are explicit
- You avoid “if/else sprawl” in the orchestrator
- Complex workflows become testable

If you adopt XState, follow App Router best practices:

- Keep machines in **Client Components**
- Inject side effects (API calls) as services
- Keep step UI components “dumb”

---

## Standard server route designs

### A) Persistence routes (recommended shape)

Keep a consistent REST surface:

- `GET /api/<workflow-slug>`: list user’s runs
- `POST /api/<workflow-slug>`: create/update run
- `GET /api/<workflow-slug>/:id`: load run
- `DELETE /api/<workflow-slug>/:id`: delete run

Rules:

- Must require auth (Supabase)
- Must scope by `userId`
- Must avoid persisting `File` or large raw text

### B) Execution routes (recommended shape)

Prefer one “execution” endpoint:

- `POST /api/<workflow-slug>/analyze`

Request should include:

- `step` (the step ID)
- `modelId` (required for AI-powered workflows; scaffolded templates assume this)
- `input` (validated by Zod)
- optional `context` (previous outputs)

Response should be:

- `{ success: boolean, data?: output, error?: string }`

This keeps clients simple and makes steps rerunnable.

---

## AI SDK 5 (repo standard)

- **CRITICAL**: In workflow analyze routes, prefer `robustGenerateObject()` from `@/lib/workflows/schema-repair` over raw `generateObject()`.
- **Prompts**: Include `${getCurrentDatePrompt()}\n\n` at the start of any date-sensitive prompt. For document metadata dates, set programmatically with `new Date().toISOString()`.

---

## Standard progress + status reporting

### For non-chat workflows

Default approach:

- Use non-streaming JSON responses.
- Add a consistent client-side “running” state.

If you need richer UX:

- Stream progress using the **UI message stream protocol** (SSE) and “data parts” like:
  - `data-status`
  - `data-progress`
  - `data-step`

(Do this only if the workflow UI is built to consume SSE.)

---

## File ingestion standard

Use the shared upload routes:

- Signed upload (preferred for PDFs / Vercel checkpoint avoidance):
  - `POST /api/files/upload/signed` (get signed upload URL + storage path)
  - `PUT <signedUrl>` (upload bytes directly to Supabase Storage)
  - `POST /api/files/upload/finalize` (persist metadata + extract text)
- Legacy multipart (fallback): `POST /api/files/upload`

Workflow rules:

- Treat `File` objects and extracted text as **client-only**.
- Persist only:
  - file name
  - storage URL/path (if required)
  - extracted text hashes (optional) if you need cache keys

---

## Packaging for reuse across apps

To reuse workflows in other apps, aim for:

- A workflow package boundary that contains:
  - `spec.ts`
  - step UI components
  - server route handlers (or pure “services” that route handlers call)

Avoid coupling workflows directly to:

- app-specific DB table names
- app-specific styling tokens

Instead, use adapters:

- persistence adapter (save/load/list)
- model adapter (AI Gateway)
- file adapter (upload)

---

## V2 workflow creation checklist

- **[Spec]** Create `lib/workflows/<slug>/spec.ts`
- **[Types]** Add `types.ts` only if inference isn’t enough
- **[UI]** Create `app/(chat)/workflows/<slug>/page.tsx` (server wrapper) + `<slug>-client.tsx` (client using `WorkflowContainer`)
- **[Steps]** Implement `components/<slug>/*` with standardized props
- **[Exec route]** Add `POST /api/<slug>/analyze` (auth + Zod validation)
- **[Persistence]** Add standard CRUD routes (if needed)
- **[Docs]** Create `docs/ai-sdk/workflows/<slug>/` and write `docs/ai-sdk/workflows/<slug>/README.md` (near the end, once names/paths are stable)
  - Must include:
    - workflow purpose + step list (IDs/labels)
    - how to run locally (dev server + URL)
    - key file references (copy/paste paths):
      - `lib/workflows/<slug>/spec.ts`
      - `lib/workflows/<slug>/types.ts` (if present)
      - `app/(chat)/workflows/<slug>/page.tsx`
      - `components/<slug>/*`
      - `app/api/<slug>/analyze/route.ts`
      - `app/api/<slug>/route.ts` and `app/api/<slug>/[id]/route.ts` (if present)
- **[Quality gates]** `pnpm lint`, `pnpm type-check`, and if touching chat/AI infra, `pnpm verify:ai-sdk`

---

## Current State in Orbis

**Implemented workflows** (4 total):
- **Paper Review** (hand-orchestrated) - 8-step academic review workflow
- **IC Memo** (spec-driven V2) - 7-step investment memo workflow
- **Market Outlook** (spec-driven V2) - 7-step market analysis workflow
- **LOI** (spec-driven V2) - 7-step commercial real estate LOI workflow

**Standardization status**:
- **New workflows** (recommended): Use `WorkflowContainer` + `useWorkflowOrchestrator` for unified orchestration (eliminates 500+ lines of boilerplate per workflow)
- **Legacy workflows** (ic-memo, loi, market-outlook): Use individual shared runtime hooks (`useRunId`, `useWorkflowSave`, `useWorkflowLoad`, `useWorkflowAnalyze`, `useWorkflowCitations`) - these can be migrated to `WorkflowContainer` over time
- All workflows use shared UI components from `components/workflows/*`
- Spec-driven V2 is the recommended pattern (ic-memo, market-outlook, loi)
- Paper Review uses hand-orchestrated pattern but still benefits from shared hooks

**For new workflows**:
- Use spec-driven V2 architecture (recommended)
- Start with `spec.ts` as the "source of truth"
- Use shared workflow layout components (`WorkflowPageShell`, `WorkflowProgressBar`, `WorkflowStepper`, `WorkflowStepCard`) from `components/workflows/`
- Integrate shared runtime hooks for consistency
- Keep analysis routes per workflow
