# {{WORKFLOW_TITLE}} Workflow

{{WORKFLOW_DESCRIPTION}}

## Overview

This workflow implements a standardized spec-driven architecture for `{{workflow_slug}}` with:

- A workflow client built with `WorkflowContainer` that runs each step via `/api/{{workflow_slug}}/analyze`
- Autosave of workflow state to the app database (Drizzle/Postgres)

## Workflow Steps

Define the canonical step ordering in `lib/workflows/{{workflow_slug}}/spec.ts`, then document it here.

Template example:

1. **step1**: [Description]
2. **step2**: [Description]
3. **finalize/report**: [Description]

## Architecture

### Files

- `lib/workflows/{{workflow_slug}}/spec.ts` - Workflow specification (single source of truth)
- `lib/workflows/{{workflow_slug}}/types.ts` - TypeScript type definitions
- `app/(chat)/workflows/{{workflow_slug}}/page.tsx` - Server wrapper (fetches session, renders client)
- `app/(chat)/workflows/{{workflow_slug}}/{{workflow_slug}}-client.tsx` - Client (configures `WorkflowContainer` + renders step components)
- `components/{{workflow_slug}}/` - Step UI components
- `app/api/{{workflow_slug}}/analyze/route.ts` - AI execution endpoint
- `app/api/{{workflow_slug}}/route.ts` - CRUD operations (list/create)
- `app/api/{{workflow_slug}}/[id]/route.ts` - CRUD operations (get/delete)
- `lib/db/migrations/*_create_{{workflow_snake}}_runs_table.sql` - App DB migration for workflow run persistence

### Key Patterns

**Spec-Driven**: All step definitions, schemas, and dependencies are defined in `spec.ts`

**Dumb Components**: Step components are pure presentational - they receive props and emit events

**Unified Orchestration**: The client uses `WorkflowContainer` (`components/workflows/workflow-container.tsx`), which wraps `useWorkflowOrchestrator` for navigation, execution, save/load, auto-run, and diagnostics.

**Standard API**:

- `POST /api/{{workflow_slug}}/analyze` - Execute step analysis
- `GET /api/{{workflow_slug}}` - List workflow runs
- `POST /api/{{workflow_slug}}` - Create/update workflow run
- `GET /api/{{workflow_slug}}/[id]` - Get workflow run
- `DELETE /api/{{workflow_slug}}/[id]` - Delete workflow run

## Usage

### Running the Workflow

1. Navigate to `/{{workflow_slug}}`
2. Complete steps in order
3. Each step validates prerequisites before running
4. State is auto-saved with debouncing

Autosave behavior:

- Autosave should start after the first meaningful step output exists.
- Saves are debounced (2 seconds).
- The first save returns a run `id`; subsequent saves include that `id` to update the same run.

## Exports (recommended)

Most workflows should treat the final deliverable as **canonical Markdown** in state, and derive exports client-side.

Recommended formats:

- **Markdown (.md)**: Blob download (`text/markdown`)
- **PDF (.pdf)**: use `lib/pdf-export.ts` → `downloadAsPDF({ title, content, filename, includeMermaid })`
- **LaTeX (.tex)**: use `lib/latex-export.ts` → `downloadAsLatex({ title, content, filename })`
- **Word (.doc)** (optional): Word-compatible HTML in a Blob (`application/msword`)
- **Plain text (.txt)** (optional): simple markdown-to-text conversion

### Adding New Steps

1. Add step definition to `spec.ts`:

   ```typescript
   {
     id: "new_step",
     label: "New Step",
     description: "Step description",
     icon: "IconName",
     inputSchema: z.object({ /* ... */ }),
     outputSchema: z.object({ /* ... */ }),
     dependsOn: ["previous_step"],
     persist: ["field1", "field2"],
     executeEndpoint: "/api/{{workflow_slug}}/analyze",
   }
   ```

2. Add output field to `WorkflowState` in `types.ts`

3. Create step component in `components/{{workflow_slug}}/new-step.tsx`

4. Add step case to `app/api/{{workflow_slug}}/analyze/route.ts`

5. Add step rendering logic to `page.tsx`

## Development

### Running Locally

```bash
pnpm dev
```

Navigate to `http://localhost:3000/workflows/{{workflow_slug}}`

### Type Checking

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
```

### AI SDK Verification

```bash
pnpm verify:ai-sdk
```

## Configuration

### AI Models

Workflow uses the AI Gateway for model selection. Users can choose from available models in the UI.

### Persistence

Runs are persisted to the app database (Drizzle/Postgres) in a `<slug>_runs` table.

Scaffold note:

- The scaffolder generates the migration file.
- You still need to wire persistence end-to-end by adding the Drizzle table in `lib/db/schema.ts` and query helpers in `lib/db/queries.ts`, then updating the CRUD routes to use those helpers (see `ic-memo` for a working example).

## Testing

TODO: Add Playwright tests for workflow steps

## Known Issues

- [ ] CRUD routes are scaffolded with placeholders until you wire Drizzle schema + query helpers.
- [ ] No error recovery mechanism for failed steps.

## Future Enhancements

- [ ] Add state machine (XState) for complex branching
- [ ] Stream progress updates for long-running steps
- [ ] Add workflow run history/versioning
- [ ] Improve export fidelity (DOCX and bibliography support, optional `.bib`)

## References

- [Workflow Authoring Guide V2](../../../.claude/skills/workflow-author/references/workflow-authoring-guide.md)
- [AI SDK 5 Documentation](../../ai-sdk-5/)
- [Next.js App Router](https://nextjs.org/docs/app)
