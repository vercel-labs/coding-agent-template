# IC Memo Workflow - Next.js 16 Implementation Review

**Review Date**: December 15, 2025
**Reviewed Files**:

- `app/(chat)/workflows/ic-memo/page.tsx` - Client component with state management
- `app/api/ic-memo/analyze/route.ts` - Analysis endpoint with AI SDK 5 integration
- `app/api/ic-memo/route.ts` - CRUD operations (list/create)
- `app/api/ic-memo/[id]/route.ts` - Individual run operations (get/delete)
- `lib/workflows/ic-memo/spec.ts` - Workflow configuration
- `lib/workflows/ic-memo/types.ts` - Type definitions
- `lib/server.ts` - Auth client setup
- `lib/ai/supabase-retrieval.ts` - Vector search integration

---

> **Status note (updated 2025-12-17)**: This review is partially historical. Key implementation changes since this review:
> - The IC Memo workflow UI lives in `app/(chat)/workflows/ic-memo/ic-memo-client.tsx` with a server wrapper `page.tsx` (non-prod diagnostics gating).
> - Default model selection is entitlements-aware (not hardcoded).
> - Autosave/runId handling was hardened to avoid duplicate inserts.
> - `retrieveWeb` now uses internet-search subagent calls (parallel) and is not stubbed.
> - The Synthesize evidence table is rendered as Markdown and citations in the table are markdown links (not raw OpenAlex IDs).

## ✅ What's Correct

### 1. **Auth Middleware Pattern (Correct)**

All API routes properly implement Supabase Auth via `createClient()`:

- `POST /api/ic-memo/analyze` - Session check at line 21-30
- `GET /api/ic-memo` - Session check at line 20-29
- `POST /api/ic-memo` - Session check at line 54-64
- `GET/DELETE /api/ic-memo/[id]` - Session check at line 21-30 (both methods)

**Why correct**: Uses `await createClient()` from `lib/server.ts` which handles cookie management via Supabase SSR client. All routes return `{ status: 401 }` for unauthenticated requests.

### 2. **Next.js 16 Dynamic Route Params Pattern (Correct)**

The `[id]/route.ts` correctly handles async params:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
);
```

Line 33: `const { id } = await params;` properly awaits the Promise returned by Next.js 16.

**Why correct**: This is the Next.js 16+ standard pattern for dynamic routes (no longer synchronous params).

### 3. **API Response Status Codes (Correct)**

Consistent HTTP status code usage:

- `401` - Unauthorized (no session)
- `400` - Bad request (missing fields, validation)
- `404` - Not found (run doesn't exist)
- `500` - Server error (caught exceptions)
- `200`/`201` - Success (implicit, default)

### 4. **Zod Schema Validation (Correct)**

The `analyze` endpoint validates input against step-specific schemas:

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

Lines 54-63 properly validate and return meaningful error messages.

### 5. **AI SDK 5 Integration (Correct)**

Uses correct AI SDK 5 patterns:

- `generateObject()` instead of old `generateText()` (line 178, 214, 330, 376, 418)
- `gateway(modelId)` for unified provider access (lines 179, 215, 331, 377, 419)
- Zod schema passed to `generateObject()` (line 180 `schema: stepConfig.outputSchema`)
- No use of deprecated v4 patterns (`maxTokens`, `parameters`, `CoreMessage`)

### 6. **Workflow State Type Safety (Correct)**

Uses discriminated union pattern for step outputs:

- `WorkflowState` interface defines all possible step outputs (lines 28-98 in types.ts)
- Spec-driven validation with `IC_MEMO_SPEC.steps` array
- Type inference from Zod schemas (`type WorkflowStep`, `StepInput<S>`, `StepOutput<S>`)

### 7. **Spec-Driven Architecture (Correct)**

The `IC_MEMO_SPEC` (spec.ts) is a single source of truth:

- Each step has `inputSchema`, `outputSchema`, `dependsOn`, `executeEndpoint`
- Step-specific handlers are selected via switch statement (lines 68-137)
- Output validation against spec schema (line 140)
- Client-side dependency checking uses `currentStepConfig.dependsOn`

### 8. **Error Handling in Analysis Route (Correct)**

Good error boundary patterns:

- Try-catch wraps entire handler (line 19-165)
- Input validation before processing (line 54-63)
- Output validation after AI generation (line 140-150)
- Meaningful error messages with context
- Schema mismatch caught with structured logging (line 142)

### 9. **Autosave Pattern (Correct)**

Client-side debounced autosave in page.tsx:

- `useEffect` debounces state changes with 1000ms timeout (lines 84-92)
- `handleSave()` callback properly depends on `[state]` (lines 97-112)
- Save status tracked with `"idle"`, `"saving"`, `"saved"` states
- User feedback: "✓ Saved" indicator (line 255)

### 10. **Intake-to-Draft Dependency Chain (Correct)**

The workflow properly chains step dependencies:

- `intake` → `plan` → `retrieveAcademic` + `retrieveWeb`
- `retrieveAcademic` + `synthesize` → `counterevidence` → `draftMemo`
- `canRunStep` validation checks all `dependsOn` steps are complete (lines 231-236)
- Client prevents running steps with unmet dependencies

---

## ⚠️ Issues Found

### **SEVERITY: HIGH**

#### 1. **Persistence is DB-backed (Resolved)**

Workflow run persistence is implemented via **Drizzle/App DB**:

- Table: `ic_memo_runs` (migration: `lib/db/migrations/0021_create_ic_memo_runs_table.sql`)
- Drizzle table: `lib/db/schema.ts` (`icMemoRun`)
- Query helpers: `lib/db/queries.ts` (`saveIcMemoRun`, `getIcMemoRunById`, `getIcMemoRunsByUserId`, `deleteIcMemoRunById`)
- Routes: `app/api/ic-memo/route.ts`, `app/api/ic-memo/[id]/route.ts`

---

#### 2. **Missing useCallback Dependency Syntax Bug**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` line 92
**Issue**:

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    if (saveStatus !== "saving") {
      handleSave(); // ❌ handleSave depends on state
    }
  }, 1000);
  return () => clearTimeout(timer);
}, [state]); // ✅ Correct dependency
```

The `handleSave` function is defined inside `useCallback` with dependency `[state]` (line 112), so the effect should work correctly. However, **linting will warn** because:

- Effect depends on `state`
- `handleSave` depends on `state`
- But `handleSave` is recreated when `state` changes
- This causes rapid state → handleSave → effect → state cycles

**Better pattern**:

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    // Move save logic here to avoid function dependency
    setSaveStatus("saving");
    // inline fetch...
  }, 1000);
  return () => clearTimeout(timer);
}, [state]);
```

**Impact**: Potential ESLint warnings; could trigger multiple saves per state change. Low risk but not optimal.

---

#### 3. **No Error Recovery for Failed AI Requests**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` lines 175-186
**Issue**:

```typescript
const response = await fetch("/api/ic-memo/analyze", {
  method: "POST",
  body: JSON.stringify({ ... })
});

if (!response.ok) throw new Error("Analysis failed");
```

**Problems**:

- No differentiation between server errors (500), client errors (400), auth errors (401)
- No retry logic for transient failures
- User sees generic "Failed to run step" alert
- Network errors not distinguished from API errors

**Example improvement**:

```typescript
if (response.status === 401) {
  // Redirect to login
  router.push("/auth/login");
} else if (response.status === 429) {
  // Rate limited - show backoff message
} else if (!response.ok) {
  const data = await response.json().catch(() => ({}));
  const message = data.error || `HTTP ${response.status}`;
  alert(`Error: ${message}`);
}
```

**Impact**: Poor UX for error cases; difficult to diagnose failures.

---

#### 4. **Unvalidated Model ID in Client**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` line 49
**Issue**:

```typescript
selectedModelId: "anthropic/claude-haiku-4.5", // Hardcoded default
```

**Problems**:

- No validation that model exists or is available to user
- No entitlements check (guest vs regular user)
- Model should come from user's cookie or entitlements
- Per project CLAUDE.md: "Never scatter model IDs throughout the codebase"
- Model resolution should use `lib/ai/models.ts` and `resolveLanguageModel()`

**Expected pattern**:

```typescript
import { resolveInitialChatModel } from "@/lib/ai/initial-model";
const defaultModel = await resolveInitialChatModel(session, userType);
```

**Impact**: Users get wrong model for their tier; guest users may exceed limits.

---

#### 5. **Web retrieval uses internet-search model (Resolved)**

`retrieveWeb` is implemented in `app/api/ic-memo/analyze/route.ts` using `getInternetSearchModel()` + `internetSearchPrompt()` to produce structured `webSources` and `marketContext`.

---

#### 6. **Hybrid Search May Fail Silently**

**Location**: `app/api/ic-memo/analyze/route.ts` lines 250-278
**Issue**:

```typescript
for (const keyword of input.searchKeywords.slice(0, 5)) {
  try {
    const results = await findRelevantContentSupabase(keyword, { ... });
    // ...
  } catch (error) {
    console.error(`Search failed for keyword...`);
    searchResults.push(`Keyword "${keyword}": search failed`);
    // Continues to next keyword - no throw
  }
}
```

**Problems**:

- All keywords fail → `allPapers` array is empty but no error thrown
- Endpoint returns success with empty papers
- User unaware that search failed
- No user notification of degraded results

**Better pattern**:

```typescript
const failedKeywords = [];
for (const keyword of input.searchKeywords.slice(0, 5)) {
  try {
    // ...
  } catch (error) {
    failedKeywords.push(keyword);
  }
}

// If all searches failed, return error
if (failedKeywords.length === input.searchKeywords.length) {
  throw new Error("All keyword searches failed");
}

// If partial failure, warn but continue
if (failedKeywords.length > 0) {
  console.warn(`Search failed for keywords: ${failedKeywords.join(", ")}`);
}
```

**Impact**: Workflow appears successful but lacks evidence; leads to poor memos.

---

### **SEVERITY: MEDIUM**

#### 7. **Missing Streaming Response for Long Operations**

**Location**: `app/api/ic-memo/analyze/route.ts` entire route
**Issue**: All step analyses are synchronous blocking calls:

- `retrieveAcademic` searches 5 keywords sequentially (lines 250-278)
- `synthesize` generates findings (lines 319-356)
- `draftMemo` generates full memo (lines 403-479)

**Problems**:

- No progress updates to client during long operations
- Timeout risk on slow networks (Vercel Functions default 60s for standard)
- No cancellation support
- Poor UX: user sees spinner with no feedback

**Per project constraints**: "STREAMING REQUIRED - All chat routes use `createUIMessageStream`"

**This is a chat-adjacent route that could benefit from streaming**:

```typescript
export async function POST(request: NextRequest) {
  // For long operations, use streaming
  const readable = await analyzeStepStreaming(step, input);
  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

**Impact**: Poor experience on slow connections; potential timeouts on large searches.

---

#### 8. **No Concurrent Step Execution**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` lines 165-208
**Issue**: Each step must be run sequentially:

```typescript
const handleRunStep = useCallback(async () => {
  setIsRunning(true);
  const response = await fetch("/api/ic-memo/analyze", { ... });
  // Single sequential operation
}, [state, getCurrentStepInput]);
```

**Problems**:

- `retrieveAcademic` and `retrieveWeb` have no `dependsOn` overlap but can't run together
- Total runtime = sum of all steps (could be parallelized)
- Within `retrieveAcademic`, keywords searched sequentially (5 at a time)

**Better pattern** for keyword searches:

```typescript
const results = await Promise.all(
  input.searchKeywords.slice(0, 5).map((keyword) =>
    findRelevantContentSupabase(keyword, options).catch((err) => {
      console.error(`Keyword "${keyword}" failed`, err);
      return [];
    })
  )
);
const allPapers = results.flat();
```

**Impact**: Longer workflow runtime; degraded UX for multi-step workflows.

---

#### 9. **No Explicit Content Length Check for Papers**

**Location**: `app/api/ic-memo/analyze/route.ts` lines 326-328
**Issue**:

```typescript
const papersContext = input.papers
  .map(
    (p: any) =>
      `[${p.id}] ${p.title} (${p.authors.join(", ")}, ${p.year}):\n${p.abstract}`
  )
  .join("\n\n");
```

**Problems**:

- Could easily exceed token limits if 30 papers with long abstracts
- No token counting before prompt construction
- May cause AI request to fail silently or get truncated
- Abstracts not truncated

**Better pattern**:

```typescript
const MAX_ABSTRACT_LENGTH = 500;
const papersContext = input.papers
  .map((p: any) => {
    const abstract = (p.abstract || "").substring(0, MAX_ABSTRACT_LENGTH);
    return `[${p.id}] ${p.title}...\n${abstract}`;
  })
  .join("\n\n");
```

**Impact**: Token limit exceeded errors; incomplete synthesis results.

---

#### 10. **Deprecated useCallback Type Pattern**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` lines 97-112, 117-160, 165-208
**Issue**: `useCallback` hooks use `any` types:

```typescript
const handleSave = useCallback(async () => { ... }, [state]);
const getCurrentStepInput = useCallback(() => { ... }, [state, intakeInput]);
```

**Problems**:

- No explicit dependency array type safety
- TypeScript doesn't catch missing dependencies
- Could silently omit necessary dependencies

**Better pattern**:

```typescript
const handleSave = useCallback(
  async (): Promise<void> => {
    // ...
  },
  [state] as const
);
```

Or better yet, avoid by lifting state updates:

```typescript
// Instead of: useCallback(async () => { ... }, [state])
// Use: useEffect(() => { ... }, [state])
```

**Impact**: Low risk given the small component, but violates TypeScript best practices.

---

### **SEVERITY: LOW**

#### 11. **Alert() Instead of Toast Notifications**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` lines 168, 186, 204, 200
**Issue**:

```typescript
alert("Please select an AI model");
alert(`Error: ${result.error}`);
alert("Failed to run step");
```

**Problems**:

- Blocks entire UI with modal dialogs
- Not dismissible without confirming
- Poor mobile UX
- No error logging for debugging

**Expected pattern** (from app standards):

```typescript
import { toast } from "@/hooks/use-toast"; // or shadcn toast
toast({
  title: "Error",
  description: result.error,
  variant: "destructive",
});
```

**Impact**: Poor UX; modal dialogs feel dated compared to toast notifications.

---

#### 12. **Hard Resets State on Step Change**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` lines 269-275
**Issue**:

```typescript
onClick={() =>
  setState((prev) => ({
    ...prev,
    currentStep: step.id as WorkflowStep,
  }))
}
```

Users can click any completed step to go back and edit. This is good for workflow flexibility, but:

- No confirmation before going back (could lose future steps)
- No way to mark a step as "needs re-running"
- Unclear if dependencies are still valid

**Better pattern**:

```typescript
const canGoToStep =
  completedSteps.includes(step.id) ||
  (currentStepIndex > stepIndex && completedSteps.includes(step.id));

if (canGoToStep) {
  // Mark all downstream steps as invalidated
  const downstreamSteps = steps.slice(stepIndex + 1);
  setState((prev) => ({
    ...prev,
    currentStep: step.id,
    completedSteps: prev.completedSteps.filter(
      (s) => !downstreamSteps.find((ds) => ds.id === s)
    ),
  }));
}
```

**Impact**: Minor - UX could be clearer but not breaking.

---

#### 13. **No Type Guard for Step Components**

**Location**: `app/(chat)/workflows/ic-memo/page.tsx` lines 302-401
**Issue**: All step components receive `any` props:

```typescript
<Intake
  input={intakeInput}
  output={state.intakeOutput}
  onChange={setIntakeInput}
  // ...
/>
```

**Problems**:

- No compile-time verification of prop types
- If step output schema changes, components don't error
- Runtime errors if types mismatch

**Better pattern**:

```typescript
import type { StepInput, StepOutput } from "@/lib/workflows/ic-memo/spec";

interface StepComponentProps<S extends WorkflowStep> {
  input: StepInput<S>;
  output: StepOutput<S> | null;
  onChange: (input: StepInput<S>) => void;
  onRun: () => Promise<void>;
  isRunning: boolean;
  readOnly: boolean;
}

// Then enforce in components:
function IntakeComponent(props: StepComponentProps<"intake">) {
  // input: StepInput<"intake">
  // output: StepOutput<"intake"> | null
}
```

**Impact**: Low - only affects maintainability if schemas drift.

---

#### 14. **Missing Success Response Structure Consistency**

**Location**: `app/api/ic-memo/route.ts` lines 42, 104, 120
**Issue**:

```typescript
// GET returns
return NextResponse.json({ runs: userRuns });

// POST returns
return NextResponse.json({ run: newRun });
```

No wrapper around success responses (compare to `AnalysisResponse<T>`):

```typescript
export interface AnalysisResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**Better pattern**: Standardize all responses:

```typescript
interface CrudResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// In routes
return NextResponse.json<CrudResponse<typeof userRuns>>({
  success: true,
  data: userRuns,
});
```

**Impact**: Minimal - just inconsistent API structure. Easy to refactor.

---

#### 15. **No Rate Limiting on Analyze Endpoint**

**Location**: `app/api/ic-memo/analyze/route.ts`
**Issue**: No rate limiting on expensive AI operations:

- `generateObject()` calls to AI gateway (multiple per workflow)
- Each call costs tokens
- No protection against brute-force or abuse

**Expected pattern**:

```typescript
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 h"),
});

const { success } = await ratelimit.limit(session.user.id);
if (!success) {
  return NextResponse.json(
    { success: false, error: "Rate limit exceeded" },
    { status: 429 }
  );
}
```

**Impact**: Potential for token/cost abuse; no protection for multi-tenant use.

---

## 💡 Recommendations for Improvements

### **Tier 1: Critical (Before Production)**

1. **Implement Database Persistence** (Resolved)
   - Persistence is implemented via `ic_memo_runs` + Drizzle query helpers.

2. **Add Web Search Implementation** (Resolved)
   - `retrieveWeb` is implemented using `getInternetSearchModel()` + `internetSearchPrompt()`.

3. **Fix Model Selection**
   - Use `lib/ai/models.ts` and `resolveLanguageModel()`
   - Check user entitlements via `lib/ai/entitlements.ts`
   - Move hardcoded model to server-side default

### **Tier 2: Important (Before Public Launch)**

4. **Add Streaming for Long Operations**
   - Implement SSE (Server-Sent Events) for progress updates
   - Show per-keyword search progress in UI
   - Use `createReadableStream()` pattern

5. **Improve Error Recovery**
   - Differentiate HTTP status codes in error handling
   - Show contextual error messages
   - Add retry UI for transient failures

6. **Validate Search Results**
   - Throw error if all searches fail
   - Return warning if partial failure
   - Fail fast rather than silent empty results

7. **Use Toast Notifications**
   - Replace `alert()` with shadcn `<Toast>`
   - Dismiss automatically after 3-5s
   - Log errors to Sentry for debugging

### **Tier 3: Nice-to-Have**

8. **Parallelize Keyword Searches**
   - Use `Promise.all()` for concurrent searches
   - Improve retrieval performance by 5x
   - Add cancellation token support

9. **Add Content Truncation**
   - Limit abstracts to 500 chars max
   - Count tokens before prompt construction
   - Gracefully degrade if limit exceeded

10. **Rate Limiting**
    - Use Upstash/Redis for request throttling
    - Protect against token abuse
    - Show user-friendly quota messages

---

## Summary Table

| Issue                     | Severity | File               | Line   | Category       |
| ------------------------- | -------- | ------------------ | ------ | -------------- |
| Model selection hardcoded | HIGH     | `page.tsx`         | 49     | Auth/Config    |
| Silent search failures    | HIGH     | `analyze/route.ts` | 250    | Error handling |
| Streaming missing         | MEDIUM   | `analyze/route.ts` | All    | UX             |
| No concurrent execution   | MEDIUM   | `page.tsx`         | 165    | Performance    |
| Token limit risk          | MEDIUM   | `analyze/route.ts` | 326    | Robustness     |
| useCallback lint warn     | MEDIUM   | `page.tsx`         | 92     | Code quality   |
| No error differentiation  | MEDIUM   | `page.tsx`         | 175    | UX             |
| Alert() modals            | LOW      | `page.tsx`         | 168+   | UX             |
| Response inconsistency    | LOW      | `route.ts`         | 42-120 | API design     |
| Step navigation UX        | LOW      | `page.tsx`         | 269    | UX             |
| No rate limiting          | LOW      | `analyze/route.ts` | 18     | Security       |
| Hard-coded timeouts       | LOW      | `page.tsx`         | 89     | Config         |
| Missing type guards       | LOW      | `page.tsx`         | 302    | TypeScript     |

---

## Next Steps

1. **Error Handling**: Replace alerts with toast + proper status code handling
2. **Testing**: Add E2E tests for full workflow with Playwright

---

_Review completed with focus on Next.js 16 patterns, AI SDK 5 integration, auth, and production readiness._
