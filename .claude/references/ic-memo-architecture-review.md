# IC Memo Workflow Architecture Review

**Date**: December 15, 2025
**Scope**: Workflow specification, type safety, step dependencies, input/output flow, tool integration, error handling

> **Status note (updated 2025-12-17)**: This architecture review is partially historical. The implementation has since changed in a few key places:
> - `retrieveWeb` is implemented (internet-search subagent calls) and no longer stubbed.
> - Workflow default model is now entitlements-aware (and the UI includes a model selector).
> - Evidence tables are rendered as Markdown in the UI, and the Synthesize step now produces markdown link citations in the evidence table (not raw OpenAlex IDs).
> - Autosave/runId handling has been hardened to avoid duplicate inserts.
> - A non-production diagnostics panel exists for faster debugging.

---

## Executive Summary

The IC Memo workflow is a **7-step academic research orchestration system** with solid foundational architecture. The spec-driven design using Zod schemas is excellent, and step dependency management is correct. However, there are **3 medium-severity issues** and **5 low-severity gaps** that should be addressed before production use.

**Overall Health**: ✅ **Architecturally Sound** | ✅ **Persistence Implemented** | ✅ **Web Retrieval Implemented**

---

## 1. Workflow Spec Completeness

### ✅ What's Correct

1. **All 7 steps properly defined** with clear progression:
   - `intake` → `plan` → `retrieveAcademic` + `retrieveWeb` (parallel) → `synthesize` → `counterevidence` → `draftMemo`

2. **Dependency graph is correct** and topologically sound:

   ```
   intake (no deps)
     ↓
   plan (depends on: intake)
     ├→ retrieveAcademic (depends on: plan)
     └→ retrieveWeb (depends on: plan)
   synthesize (depends on: retrieveAcademic)
   counterevidence (depends on: synthesize)
   draftMemo (depends on: counterevidence)
   ```

   The orchestrator correctly validates: `currentStepConfig.dependsOn.every(dep => state.completedSteps.includes(dep))`

3. **Input/output schemas are precise**:
   - Input schemas use Zod with `.min()`, `.max()`, array validation
   - Output schemas use structured objects with explicit field types
   - Each schema is mapped to its corresponding step via `Extract<...>` type inference

4. **Step icon mapping** is intuitive:
   - `FileInput`, `ListTree`, `GraduationCap`, `Globe`, `Sparkles`, `AlertTriangle`, `FileText`

### ⚠️ Issues Found

#### Issue #1: Missing Validation Context in Schemas (LOW SEVERITY)

**Problem**: Input schemas for downstream steps don't validate data shape from previous steps.

**Example**: `synthesize` expects `papers: array<{ id, title, authors, year, abstract }>`, but `retrieveAcademicOutput` includes additional fields like `journal`, `relevanceScore`, `authors` (array vs string compatibility).

**Impact**: If `retrieveAcademic` returns slightly different structure, `synthesize` will fail silently with AI output validation.

**Recommendation**:

```typescript
// In spec.ts, import types from types.ts
export const IC_MEMO_SPEC = {
  steps: [
    {
      id: "synthesize",
      inputSchema: z.object({
        structuredQuestion: z.string(),
        papers: z.array(z.object({
          id: z.string(),
          title: z.string(),
          authors: z.array(z.string()),
          year: z.number(),
          abstract: z.string(),
          // Add optional fields for flexibility
          journal: z.string().optional(),
          relevanceScore: z.number().optional(),
        })),
        webSources: z.array(...).optional(),
      }),
      // ...
    }
  ]
}
```

#### Issue #2: `retrieveWeb` Outputs Not Required by Any Step (MEDIUM SEVERITY)

**Problem**: `retrieveWeb` output (`webSources`, `marketContext`) is optional in `synthesize` input, but never explicitly required or validated.

```typescript
// synthesize inputSchema (line 148-152)
webSources: z.array(z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
})).optional(),
```

**Impact**: If web search is enabled, its results may be silently dropped during synthesis.

**Recommendation**: Make web sources explicitly handled:

- Option A: Make `synthesize` require `webSources` or provide explicit default
- Option B: Add separate `synthesizeWeb` step that follows `retrieveWeb`
- Option C (Current): Document that web sources are optional and results may be unused

**Current Status**: Code assumes Option C. If this is intentional, document it explicitly.

#### Issue #3: Journal Filter Type Mismatch (MEDIUM SEVERITY)

**Problem**: Type inconsistency in journal filtering between steps:

```typescript
// spec.ts line 36 - intake uses array of strings
journalFilter: z.array(z.string()).optional(),

// api/ic-memo/analyze route line 86 - component expects array
// But retrieveAcademic passes as-is to findRelevantContentSupabase
// which expects structured journal filters with categories/ids
```

The `Intake` component collects journal names as strings, but:

- `findRelevantContentSupabase` expects `journalIds` (filtered via RPC parameters)
- `searchPapers` tool expects `journalNames` that are resolved to IDs via `journal-resolver.ts`

**Impact**: Journal filters from Intake may not properly flow to paper search.

**Recommendation**:

```typescript
// In spec.ts
{
  id: "retrieveAcademic",
  inputSchema: z.object({
    // ... existing fields
    journalNames: z.array(z.string()).optional().describe("Journal names for filtering"),
    // Remove journalFilter and use journalNames consistently
  }),
}

// In route.ts, convert journalNames → journalIds before calling findRelevantContentSupabase
import { resolveJournalNamesToIds } from '@/lib/ai/tools/journal-resolver';
const journalIds = journalNames ? await resolveJournalNamesToIds(journalNames) : undefined;
const results = await findRelevantContentSupabase(keyword, {
  journalIds,
  // ...
});
```

---

## 2. Type Safety and Zod Validation

### ✅ What's Correct

1. **Spec-driven type inference is clean**:

   ```typescript
   // types.ts - Zod inference approach
   export type StepInput<S extends WorkflowStep> = z.infer<
     Extract<(typeof IC_MEMO_SPEC.steps)[number], { id: S }>["inputSchema"]
   >;
   ```

   This is **correct and provides full type safety** across all steps.

2. **WorkflowState interface** properly mirrors spec outputs:

   ```typescript
   intakeOutput: { structuredQuestion, scope, keyConstraints, researchStrategy } | null
   planOutput: { subQuestions, evidencePlan, searchKeywords } | null
   // etc.
   ```

3. **AnalysisRequest/AnalysisResponse types** are well-defined with proper generic support.

### ⚠️ Issues Found

#### Issue #4: WorkflowState vs Spec Drift (LOW SEVERITY)

**Problem**: `WorkflowState` (types.ts) duplicates output types instead of inferring from spec.

```typescript
// types.ts - manual duplication
synthesizeOutput: {
  keyFindings: Array<{ claim, evidence, citations, confidenceLevel }>;
  evidenceTable: string;
  uncertainties: string[];
} | null;

// spec.ts - source of truth
outputSchema: z.object({
  keyFindings: z.array(z.object({ ... })),
  evidenceTable: z.string(),
  uncertainties: z.array(z.string()),
})
```

**Impact**: If spec changes, types.ts must be manually updated or types will drift.

**Recommendation**:

```typescript
// In types.ts - derive from spec
import { IC_MEMO_SPEC } from "./spec";

type StepOutputType<S extends WorkflowStep> = z.infer<
  Extract<(typeof IC_MEMO_SPEC.steps)[number], { id: S }>["outputSchema"]
>;

// Re-derive WorkflowState from spec instead of manual duplication
export interface WorkflowState {
  intakeOutput: StepOutputType<"intake"> | null;
  planOutput: StepOutputType<"plan"> | null;
  // ... etc
}
```

---

## 3. Step Dependency Handling

### ✅ What's Correct

1. **Dependency validation in orchestrator** (page.tsx lines 231-236):

   ```typescript
   const canRunStep =
     !isRunning &&
     state.selectedModelId &&
     currentStepConfig.dependsOn.every((dep) =>
       state.completedSteps.includes(dep as WorkflowStep)
     );
   ```

   This prevents running steps out of order.

2. **Input assembly respects dependencies** (page.tsx lines 117-160):
   Each step's input is built from outputs of its dependencies:

   ```typescript
   case "synthesize":
     return {
       structuredQuestion: state.intakeOutput?.structuredQuestion || "",
       papers: state.retrieveAcademicOutput?.papers || [],
       webSources: state.retrieveWebOutput?.webSources || [],
     };
   ```

3. **Parallel execution allowed correctly**:
   - `retrieveAcademic` and `retrieveWeb` both depend on `plan` but not each other
   - Both can run in parallel (though UI renders sequentially)

### ⚠️ Issues Found

#### Issue #5: Silent Null Fallbacks (MEDIUM SEVERITY)

**Problem**: Step inputs use `|| []` or `|| ""` without warning if dependencies haven't run.

```typescript
// page.tsx line 125-126
case "retrieveAcademic":
  return {
    subQuestions: state.planOutput?.subQuestions || [],  // Silent fallback!
    searchKeywords: state.planOutput?.searchKeywords || [],
  };
```

If `plan` hasn't run, this passes empty arrays, and paper search completes with "0 papers found" instead of failing visibly.

**Impact**: User gets confused when results are empty; no error indication that dependency wasn't met.

**Recommendation**:

```typescript
// In route.ts analyzeRetrieveAcademic (line 239-289)
if (!input.searchKeywords || input.searchKeywords.length === 0) {
  return {
    success: false,
    error: "No search keywords provided. Please run the Plan step first.",
  };
}
```

Or in the orchestrator, block the "Run" button more aggressively:

```typescript
// Stricter dependency check
const stepHasRequiredData = () => {
  if (state.currentStep === "retrieveAcademic" && !state.planOutput)
    return false;
  if (state.currentStep === "synthesize" && !state.retrieveAcademicOutput)
    return false;
  // ... etc
  return true;
};

const canRunStep = !isRunning && state.selectedModelId && stepHasRequiredData();
```

---

## 4. Input/Output Flow Between Steps

### ✅ What's Correct

1. **Output persistence strategy**:

   ```typescript
   // page.tsx lines 191-197
   setState((prev) => ({
     ...prev,
     [`${state.currentStep}Output`]: result.data,  // Dynamic key!
     completedSteps: [...],
   }));
   ```

   The dynamic key approach `${step}Output` is clever and maintainable.

2. **Autosave with debounce** (page.tsx lines 84-92):

   ```typescript
   useEffect(() => {
     const timer = setTimeout(() => {
       if (saveStatus !== "saving") {
         handleSave();
       }
     }, 1000);
   }, [state]);
   ```

   Good UX pattern to avoid excessive saves.

3. **Spec defines `persist` fields**:
   ```typescript
   // spec.ts line 48
   persist: ["structuredQuestion", "scope", "keyConstraints", "researchStrategy"],
   ```
   This documents which outputs are critical.

### ⚠️ Issues Found

#### Issue #6: API Response Shape Not Validated (MEDIUM SEVERITY)

**Problem**: `/api/ic-memo/analyze` validates input and output schemas, but page.tsx doesn't verify response structure before storing.

```typescript
// page.ts route.ts lines 152-155
return NextResponse.json<AnalysisResponse>({
  success: true,
  data: outputValidation.data, // Guaranteed valid by Zod
});

// But page.tsx (line 188-197) just trusts the response
const result = await response.json();
if (result.success) {
  setState((prev) => ({
    ...prev,
    [`${state.currentStep}Output`]: result.data, // Stored without validation!
  }));
}
```

**Impact**: If API returns malformed data (e.g., missing fields), state becomes corrupted.

**Recommendation**:

```typescript
// page.tsx - add response validation
const handleRunStep = useCallback(async () => {
  // ... existing code
  const result = await response.json();

  // Validate response structure
  if (!result.success || !result.data) {
    alert(`Error: ${result.error || "Unknown error"}`);
    return;
  }

  // Optional: validate data shape matches spec
  const stepConfig = IC_MEMO_SPEC.steps.find(s => s.id === state.currentStep);
  const validation = stepConfig?.outputSchema.safeParse(result.data);
  if (!validation?.success) {
    alert("API returned unexpected data format");
    console.error("Validation failed:", validation?.error);
    return;
  }

  setState((prev) => ({
    ...prev,
    [`${state.currentStep}Output`]: validation.data,
    completedSteps: [...],
  }));
}, [state]);
```

---

## 5. Integration with Existing Tools

### ✅ What's Correct

1. **`findRelevantContentSupabase` integration** (route.ts lines 245-289):
   - Correctly maps papers from Supabase RPC to expected output schema
   - Handles v5/v4/v3 fallback gracefully
   - Deduplicates papers by `key`
   - Extracts and formats paper metadata correctly

2. **AI Gateway integration** for synthesis/analysis steps:

   ```typescript
   // route.ts line 179
   const { object } = await generateObject({
     model: gateway(modelId),
     schema: stepConfig.outputSchema,
     prompt: `...`,
   });
   ```

   Uses AI SDK 5 correctly with `generateObject` + Zod schema.

3. **Step handlers all follow same pattern**:
   - Input validation (via stepConfig.inputSchema.safeParse)
   - Business logic (hybrid search, AI analysis, etc.)
   - Output validation (via stepConfig.outputSchema.safeParse)
   - Error handling with proper HTTP status codes

### ⚠️ Issues Found

#### Issue #7: `retrieveWeb` Is Stubbed (MEDIUM SEVERITY)

**Problem**: Web search is hardcoded to return empty results (line 308-313):

```typescript
async function analyzeRetrieveWeb(
  modelId: string,
  input: any,
  context?: any
): Promise<any> {
  if (!input.enableWebSearch) {
    return { webSources: [], marketContext: "Web search disabled" };
  }

  // TODO: Integrate with internetSearch tool
  return {
    webSources: [],
    marketContext: "Web search integration pending",
  };
}
```

**Impact**: `retrieveWeb` step cannot be used; always returns empty results.

**Recommendation**: Implement web search integration:

```typescript
import { internetSearch } from "@/lib/ai/tools/internet-search";

async function analyzeRetrieveWeb(
  modelId: string,
  input: any,
  context?: any
): Promise<any> {
  const stepConfig = IC_MEMO_SPEC.steps.find((s) => s.id === "retrieveWeb")!;

  if (!input.enableWebSearch) {
    return { webSources: [], marketContext: "Web search disabled" };
  }

  // Use internetSearch tool via Vercel AI SDK
  // This may require wrapping the tool execution
  // For now, return placeholder

  // Option 1: Delegate to AI model to perform search
  const { object } = await generateObject({
    model: gateway(modelId),
    schema: stepConfig.outputSchema,
    prompt: `
      Search the web for current events and market context related to these keywords:
      ${input.searchKeywords.join(", ")}

      Return structured results with title, URL, snippet, and publish date.
    `,
    tools: {
      internetSearch: {
        description: "Search the web for current information",
        parameters: z.object({
          query: z.string(),
        }),
      },
    },
  });

  return object;
}
```

#### Issue #8: Tool Session Context Missing (LOW SEVERITY)

**Problem**: `retrieveAcademic` calls `findRelevantContentSupabase` but doesn't have session/dataStream context.

```typescript
// route.ts line 252 - direct function call, no session/dataStream
const results = await findRelevantContentSupabase(keyword, { ... });
```

Compare to existing pattern in `lib/ai/tools/search-papers.ts`:

```typescript
export const searchPapers = ({
  session: _session,
  dataStream,
  chatId,
}: FactoryProps) =>
  tool({
    // ... requires session + dataStream for citation storage
  });
```

**Impact**: If `retrieveAcademic` needs to store citations or emit progress, it can't.

**Recommendation**: Pass session context (though the current direct call is simpler):

```typescript
async function analyzeRetrieveAcademic(
  session: Session, // Already passed!
  input: any,
  context?: any
): Promise<any> {
  // session is available but not used
  // If citation tracking is needed:
  // const chatId = context?.chatId;
  // const citationIds = await storeCitationIds(papers, chatId, session.user.id);
}
```

---

## 6. Error Handling and Edge Cases

### ✅ What's Correct

1. **API error handling is solid**:

   ```typescript
   // route.ts lines 156-164
   catch (error) {
     console.error("Analysis error:", error);
     return NextResponse.json<AnalysisResponse>(
       { success: false, error: error instanceof Error ? error.message : "Analysis failed" },
       { status: 500 }
     );
   }
   ```

2. **Zod validation errors caught and reported**:

   ```typescript
   const validationResult = stepConfig.inputSchema.safeParse(input);
   if (!validationResult.success) {
     return NextResponse.json(
       {
         success: false,
         error: `Invalid input: ${validationResult.error.message}`,
       },
       { status: 400 }
     );
   }
   ```

3. **Supabase hybrid search has fallback chain** (v5 → v4 → v3).

### ⚠️ Issues Found

#### Issue #9: No Timeout Handling in Page Component (LOW SEVERITY)

**Problem**: Long-running steps (especially `retrieveAcademic` with large result sets) may timeout without user feedback.

```typescript
// page.tsx lines 165-207
const handleRunStep = useCallback(async () => {
  setIsRunning(true);
  try {
    const response = await fetch("/api/ic-memo/analyze", {
      // No timeout specified!
      method: "POST",
      // ...
    });
  }
}, []);
```

**Impact**: User sees spinner indefinitely if request hangs.

**Recommendation**:

```typescript
const handleRunStep = useCallback(async () => {
  setIsRunning(true);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch("/api/ic-memo/analyze", {
      method: "POST",
      signal: controller.signal,
      // ...
    });

    clearTimeout(timeoutId);
    // ...
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      alert(
        "Request timed out. Try simplifying your search or running the step again."
      );
    } else {
      alert("Failed to run step");
    }
  } finally {
    setIsRunning(false);
  }
}, [state, getCurrentStepInput]);
```

#### Issue #10: AI Model Not Validated (LOW SEVERITY)

**Problem**: Page allows running steps without selecting a model, but error checking is in component button state, not in API.

```typescript
// page.tsx line 166-168
if (!state.selectedModelId) {
  alert("Please select an AI model");
  return;
}

// But what if modelId is invalid? No validation in route.ts
```

**Recommendation**: Validate modelId in route before using:

```typescript
// route.ts
if (!modelId) {
  return NextResponse.json(
    { success: false, error: "modelId is required" },
    { status: 400 }
  );
}

// Optional: validate against available models
const validModels = await getAvailableModels(session.user.id);
if (!validModels.includes(modelId)) {
  return NextResponse.json(
    { success: false, error: `Invalid model: ${modelId}` },
    { status: 400 }
  );
}
```

---

## 7. Persistence Layer

### ✅ Database Persistence Implemented

Workflow run persistence is implemented via **Drizzle/App DB**:

- Table: `ic_memo_runs` (migration: `lib/db/migrations/0021_create_ic_memo_runs_table.sql`)
- Drizzle table: `lib/db/schema.ts` (`icMemoRun`)
- Query helpers: `lib/db/queries.ts` (`saveIcMemoRun`, `getIcMemoRunById`, `getIcMemoRunsByUserId`, `deleteIcMemoRunById`)
- Routes: `app/api/ic-memo/route.ts`, `app/api/ic-memo/[id]/route.ts`

---

## Summary Table

| Category              | Status         | Issues   | Severity |
| --------------------- | -------------- | -------- | -------- |
| **Spec Completeness** | ✅ Excellent   | 3 issues | Low-Med  |
| **Type Safety**       | ✅ Good        | 1 issue  | Low      |
| **Dependencies**      | ✅ Good        | 1 issue  | Medium   |
| **Input/Output Flow** | ⚠️ Functional  | 1 issue  | Medium   |
| **Tool Integration**  | ⚠️ Partial     | 2 issues | Med-Low  |
| **Error Handling**    | ✅ Good        | 2 issues | Low      |
| **Persistence**       | ✅ Implemented | 0        | -        |

---

## Priority Recommendations

### 🔴 CRITICAL (Production Blocker)

1. **Implement database persistence** (Resolved)

### 🟠 MEDIUM (Before Release)

2. **Fix `retrieveWeb` stub** (Resolved)

3. **Add input/output validation on orchestrator** - Silent fallbacks can cause confusing behavior
   - Estimated effort: 30 minutes (client-side validation logic)

4. **Standardize journal filtering** - Type mismatch between Intake and RetrieveAcademic
   - Estimated effort: 1 hour (rename journalFilter → journalNames, integrate with resolver)

### 🟡 LOW (Nice to Have)

5. **Add timeout handling** - Long-running requests need abort mechanism
   - Estimated effort: 30 minutes

6. **Derive WorkflowState from spec** - Reduce type duplication
   - Estimated effort: 30 minutes

7. **Add API response validation in client** - Currently trusts API output shape
   - Estimated effort: 1 hour

---

## Testing Recommendations

### Unit Tests (Add to `pnpm test`)

```typescript
// tests/workflows/ic-memo.spec.ts
import { test, expect } from "@playwright/test";

test("intake step structures question correctly", async ({ page }) => {
  await page.goto("/ic-memo");

  // Fill intake form
  await page.fill('[name="question"]', "Should we invest in real estate tech?");
  await page.click("button:has-text('Run')");

  // Wait for completion
  await page.waitForSelector("text=Structured Question");

  // Verify output structure
  const output = await page.locator(".output-section").textContent();
  expect(output).toContain("structured");
});

test("dependency blocking works", async ({ page }) => {
  await page.goto("/ic-memo");

  // Navigate to Plan without completing Intake
  await page.click('button:has-text("Plan")');

  // Run button should be disabled
  const runBtn = page.locator('button:has-text("Run")');
  await expect(runBtn).toBeDisabled();
});

test("step completion prevents re-editing", async ({ page }) => {
  // ... run intake step
  // Verify input fields are read-only
  const input = page.locator('textarea[name="question"]');
  await expect(input).toHaveAttribute("disabled");
});
```

### Integration Tests

```typescript
// tests/api/ic-memo.spec.ts
test("POST /api/ic-memo/analyze validates step input", async ({ page }) => {
  const response = await page.context().request.post("/api/ic-memo/analyze", {
    data: {
      step: "intake",
      modelId: "anthropic/claude-haiku-4.5",
      input: { question: "Short" }, // Too short!
      context: {},
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.success).toBe(false);
  expect(body.error).toContain("at least 10 characters");
});

test("retrieveAcademic returns papers in expected format", async ({ page }) => {
  const response = await page.context().request.post("/api/ic-memo/analyze", {
    data: {
      step: "retrieveAcademic",
      modelId: "anthropic/claude-haiku-4.5",
      input: {
        subQuestions: ["What is the ROI of real estate tech?"],
        searchKeywords: ["real estate", "technology", "investment"],
        yearFilter: { start: 2020, end: 2025 },
      },
      context: {},
    },
  });

  expect(response.ok()).toBe(true);
  const { data } = await response.json();

  // Verify schema
  expect(data.papers).toBeInstanceOf(Array);
  expect(data.papers[0]).toHaveProperty("id");
  expect(data.papers[0]).toHaveProperty("title");
  expect(data.papers[0]).toHaveProperty("relevanceScore");
});
```

---

## Deployment Checklist

- [ ] Implement database schema for `workflow_runs` table
- [ ] Add Drizzle ORM queries to `/api/ic-memo/route.ts`
- [ ] Implement web search integration in `analyzeRetrieveWeb`
- [ ] Fix journal filter type mismatch (standardize to `journalNames`)
- [ ] Add client-side input/output validation
- [ ] Add timeout handling to fetch requests
- [ ] Update types.ts to derive from spec instead of duplicating
- [ ] Run `pnpm lint`, `pnpm type-check`, `pnpm build` to verify
- [ ] Add integration tests for all 7 steps
- [ ] Document workflow usage in README or `/docs/workflows/ic-memo.md`
- [ ] Test with real Supabase environment (not local)

---

## References

- **Spec Definition**: `@/lib/workflows/ic-memo/spec.ts` (239 lines)
- **Types**: `@/lib/workflows/ic-memo/types.ts` (146 lines)
- **Orchestrator Page**: `@/app/(chat)/workflows/ic-memo/page.tsx` (454 lines)
- **Analysis API**: `@/app/api/ic-memo/analyze/route.ts` (480 lines)
- **Persistence API**: `@/app/api/ic-memo/route.ts` (130 lines)
- **Vector Search**: `@/lib/ai/supabase-retrieval.ts` (491 lines)
- **Paper Search Tool**: `@/lib/ai/tools/search-papers.ts`
- **Project CLAUDE.md**: `@/CLAUDE.md` (Section: IC Memo spec and tools)

---

**Report Generated**: December 15, 2025
**Review Scope**: Architecture review only (not security, performance, or UI/UX)
**Reviewer**: Claude Code (Haiku 4.5)
