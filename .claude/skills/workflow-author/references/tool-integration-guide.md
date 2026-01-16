# Tool Integration Guide for Workflows

**Workflow Author Skill** | Integration Patterns for Orbis Tools

This guide shows how to integrate existing Orbis tools into your workflow steps.

---

## Overview

Orbis provides several AI-powered tools that can be integrated into workflow steps:

- **searchPapers** - Academic paper search via hybrid search
- **literatureSearch** - Multi-query orchestrated literature review
- **internetSearch** - Real-time web search via Perplexity
- **createDocument** / **updateDocument** - Artifact generation and editing
- **aiAnalyzeCached** - Cached file analysis
- **fredSeriesBatch** - Economic data retrieval

---

## Pattern 1: Academic Paper Search

### Use Case

Workflows that need to search academic literature (research workflows, literature reviews, IC memos).

### Implementation

```typescript
// analyze-route.ts
import {
  findRelevantContentSupabase,
  isSupabaseConfigured,
} from "@/lib/ai/supabase-retrieval";

async function analyzeSearchStep(
  input: { query: string; yearFilter?: { start?: number; end?: number } },
  context?: any
): Promise<any> {
  if (!isSupabaseConfigured()) {
    return {
      papers: [],
      totalFound: 0,
      searchSummary: "Supabase not configured",
    };
  }

  const results = await findRelevantContentSupabase(input.query, {
    matchCount: 10,
    rrfK: 60,
    minYear: input.yearFilter?.start,
    maxYear: input.yearFilter?.end,
    aiOnly: false,
  });

  // Transform results to match your step output schema
  return {
    papers: results.map((r) => ({
      id: r.key,
      title: (r as any).title || r.name.split("\n")[0],
      authors: (r as any).authors || [],
      year: (r as any).year || (r as any).publication_year || 0,
      journal: (r as any).journal_name || (r as any).journalName || "",
      abstract: (r as any).abstract || "",
      relevanceScore: r.similarity || 0.5,
    })),
    totalFound: results.length,
  };
}
```

### Key Points

- **Guard with `isSupabaseConfigured()`** to avoid runtime failures in environments missing Supabase env vars
- **Type coercion required** - `findRelevantContentSupabase` returns union type
- **Year filtering optional** - defaults to recent papers if omitted
- **Relevance sorting** - results already sorted by similarity score

### Common Pitfalls

❌ **Don't**: Access properties directly without type assertion

```typescript
paper.title; // ❌ May not exist on base type
```

✅ **Do**: Use type coercion or optional chaining

```typescript
(paper as any).title || paper.name.split("\n")[0]; // ✅ Safe fallback
```

---

## Pattern 2: Web Search Integration

### Use Case

Workflows that need real-time web information (market research, current events, fact-checking).

### Implementation

**Option A: Use the shared helper (recommended for workflow analyze routes)**

```typescript
import { z } from "zod";
import { getCurrentDatePrompt } from "@/lib/ai/prompts/prompts";
import { robustGenerateObject } from "@/lib/workflows/schema-repair";
import { resolveLanguageModel } from "@/lib/ai/providers";
import { searchWorkflowWebSources } from "@/lib/workflows/web-search";

async function analyzeWebSearchStep(
  modelId: string,
  input: { query: string; enableWebSearch: boolean },
  context?: any
): Promise<any> {
  if (!input.enableWebSearch) {
    return {
      webSources: [],
      marketContext: "Web search disabled",
    };
  }

  const webSources = await searchWorkflowWebSources({
    query: input.query,
    maxResults: 6,
  });

  const schema = z.object({
    marketContext: z.string(),
  });

  const summary = await robustGenerateObject<z.infer<typeof schema>>({
    stepTag: "workflow:web-search:summary",
    modelId,
    model: resolveLanguageModel(modelId),
    schema,
    prompt: `
${getCurrentDatePrompt()}

Summarize the market context for this query using ONLY the provided web sources.

Query: ${input.query}

Web sources:
${JSON.stringify(webSources, null, 2)}
    `.trim(),
    maxOutputTokens: 1200,
  });

  return { webSources, marketContext: summary.marketContext };
}
```

**Option B: Chat tool integration**

If you are implementing web search inside the main chat route, use the `internetSearch` tool pattern.

### Key Points

- **User toggle required** - Web search should be optional (costs money)
- **Workflow analyze routes** - prefer `searchWorkflowWebSources()` + optional summarization via `robustGenerateObject()`
- **Chat flows** - tool registration must be in `ACTIVE_TOOLS`
- **Rate limiting** - Consider costs of web searches

---

## Pattern 3: Multi-Step Search (Multiple Keywords)

### Use Case

Workflows that need comprehensive literature coverage across multiple sub-topics.

### Implementation

```typescript
async function analyzeMultiSearchStep(
  session: Session,
  input: { keywords: string[]; yearFilter?: { start?: number; end?: number } },
  context?: any
): Promise<any> {
  const allPapers: any[] = [];
  const searchResults: string[] = [];

  // Search each keyword (limit to 5 to prevent timeouts)
  for (const keyword of input.keywords.slice(0, 5)) {
    try {
      const results = await findRelevantContentSupabase(keyword, {
        matchCount: 10,
        minYear: input.yearFilter?.start,
        maxYear: input.yearFilter?.end,
      });

      searchResults.push(
        `Keyword "${keyword}": ${results.length} papers found`
      );

      // Deduplicate papers by ID
      for (const paper of results) {
        if (!allPapers.find((p) => p.id === paper.key)) {
          allPapers.push({
            id: paper.key,
            title: (paper as any).title || paper.name.split("\n")[0],
            authors: (paper as any).authors || [],
            year: (paper as any).year || 0,
            relevanceScore: paper.similarity || 0.5,
          });
        }
      }
    } catch (error) {
      console.error(`Search failed for keyword "${keyword}":`, error);
      searchResults.push(`Keyword "${keyword}": search failed`);
    }
  }

  // Sort by relevance and limit results
  allPapers.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topPapers = allPapers.slice(0, 30);

  return {
    papers: topPapers,
    totalFound: allPapers.length,
    searchSummary: searchResults.join("\n"),
  };
}
```

### Optimization Tips

**Sequential vs Parallel**:

- ✅ Sequential (current): Simpler, easier to debug, prevents rate limiting
- ⚠️ Parallel: Faster but complex error handling and potential timeouts

**Keyword Limiting**:

- Limit to 5 keywords to prevent timeouts (10s per search)
- Total time budget: ~50-60 seconds max for analyze routes

**Deduplication**:

- Use `paper.key` as unique identifier
- Keep highest relevance score when duplicates found

---

## Pattern 4: Document Generation

### Use Case

Workflows that generate structured documents (memos, reports, summaries).

### Implementation

```typescript
import { robustGenerateObject } from "@/lib/workflows/schema-repair";
import { resolveLanguageModel } from "@/lib/ai/providers";
import { getCurrentDatePrompt } from "@/lib/ai/prompts/prompts";

async function analyzeGenerateDocumentStep(
  modelId: string,
  input: {
    structuredQuestion: string;
    keyFindings: Array<{ claim: string; evidence: string }>;
  },
  context?: any
): Promise<any> {
  const stepConfig = WORKFLOW_SPEC.steps.find(
    (s) => s.id === "generateDocument"
  )!;

  // Use robustGenerateObject for automatic schema validation error handling
  const { object } = await robustGenerateObject({
    model: resolveLanguageModel(modelId),
    schema: stepConfig.outputSchema,
    prompt: `
${getCurrentDatePrompt()}

You are drafting a research memo.

Question: ${input.structuredQuestion}

Key Findings:
${input.keyFindings.map((f) => `- ${f.claim}\n  Evidence: ${f.evidence}`).join("\n\n")}

Generate a complete memo with:
1. Executive Summary (2-3 paragraphs)
2. Detailed Findings (with evidence)
3. Implications and Recommendations

Format in Markdown with proper headings and citations.
    `.trim(),
  });

  return object;
}
```

### Key Points

- **Model selection** - Use `gateway(modelId)` not hardcoded models
- **Schema validation** - Output automatically validated against outputSchema
- **Prompt engineering** - Be specific about format and structure
- **Context injection** - Include relevant data from previous steps

---

## Pattern 5: Error Handling

### Use Case

All workflows need robust error handling for external API calls.

### Implementation

```typescript
async function analyzeStepWithErrorHandling(
  session: Session,
  input: any,
  context?: any
): Promise<any> {
  try {
    const results = await findRelevantContentSupabase(input.query, {
      matchCount: 10,
    });

    if (results.length === 0) {
      // Return empty but valid response
      return {
        papers: [],
        totalFound: 0,
        searchSummary: "No papers found matching query",
      };
    }

    return transformResults(results);
  } catch (error) {
    console.error("Search step failed:", error);

    // Return fallback response (don't throw - let workflow continue)
    return {
      papers: [],
      totalFound: 0,
      searchSummary: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
```

### Error Handling Strategy

**✅ Do**:

- Log errors to console for debugging
- Return valid (empty) responses matching output schema
- Include error messages in user-facing fields
- Let workflow continue to next step

**❌ Don't**:

- Throw errors that break the entire workflow
- Return `null` or `undefined` (schema validation will fail)
- Silently ignore errors without logging
- Return success status with error data

---

## Pattern 6: Session Context Usage

### Use Case

Workflows that need user-specific data or permissions.

### Implementation

```typescript
import type { Session } from "@supabase/supabase-js";

async function analyzeUserSpecificStep(
  session: Session,
  input: any,
  context?: any
): Promise<any> {
  // Access user ID
  const userId = session.user.id;
  const userEmail = session.user.email;

  // Example: Filter results by user permissions
  // (Currently not used but available for future features)

  // Most workflows don't need session-specific filtering yet
  // But having it available enables future enhancements

  return await performAnalysis(input);
}
```

### When to Use Session

**Current Use Cases**:

- User-specific data filtering (future)
- Rate limiting per user (future)
- Personalized results (future)

**Not Needed For**:

- Public academic search
- Document generation
- Analysis steps

---

## Testing Integration

### Unit Test Example

```typescript
// __tests__/workflows/my-workflow/analyze.test.ts
import { POST } from "@/app/api/my-workflow/analyze/route";
import { NextRequest } from "next/server";

describe("Workflow Analyze Route", () => {
  it("should validate input schema", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/my-workflow/analyze",
      {
        method: "POST",
        body: JSON.stringify({
          step: "searchStep",
          modelId: "test-model-id", // In real code: use getWorkflowDefaultModelId(session)
          input: { query: "" }, // Invalid: empty query
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should handle search step successfully", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/my-workflow/analyze",
      {
        method: "POST",
        body: JSON.stringify({
          step: "searchStep",
          modelId: "test-model-id", // In real code: use getWorkflowDefaultModelId(session)
          input: { query: "machine learning", yearFilter: { start: 2020 } },
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.papers).toBeDefined();
  });
});
```

---

## Quick Reference

| Tool                          | Import From                   | Use For               | Session Required?  |
| ----------------------------- | ----------------------------- | --------------------- | ------------------ |
| `findRelevantContentSupabase` | `@/lib/ai/supabase-retrieval` | Academic search       | No (but available) |
| `gateway()`                   | `@ai-sdk/gateway`             | AI model access       | No                 |
| `robustGenerateObject()`      | `@/lib/workflows/schema-repair` | Structured generation with auto-repair | No |
| `resolveLanguageModel()`      | `@/lib/ai/providers`          | Model resolution      | No                 |
| `createDocumentHandler<T>()`  | `@/lib/artifacts/server`      | Artifact creation     | Yes                |
| `updateDocumentHandler<T>()`  | `@/lib/artifacts/server`      | Artifact editing      | Yes                |

---

## Common Issues & Solutions

### Issue: TypeScript errors on paper properties

**Problem**: `findRelevantContentSupabase` returns union type

```typescript
paper.title; // ❌ Type error
```

**Solution**: Use type coercion

```typescript
(paper as any).title || paper.name.split("\n")[0]; // ✅ Works
```

### Issue: Empty results not handled

**Problem**: Workflow fails when no papers found

```typescript
return results.map(...) // ❌ Breaks on empty array
```

**Solution**: Check for empty results

```typescript
if (results.length === 0) {
  return { papers: [], totalFound: 0 };
}
return { papers: results.map(...) }; // ✅ Safe
```

### Issue: Timeout on large searches

**Problem**: Searching 10+ keywords times out

```typescript
for (const keyword of allKeywords) { ... } // ❌ Too many
```

**Solution**: Limit keyword count

```typescript
for (const keyword of keywords.slice(0, 5)) { ... } // ✅ Bounded
```

---

## Next Steps

1. **Review template examples** in `assets/templates/analyze-route.template.ts`
2. **Check existing workflows** for real-world patterns
3. **Test integration early** - run `pnpm type-check` frequently
4. **Read tool documentation** in `lib/ai/tools/` for API details

For questions, see:

- `lib/ai/tools/TOOL-CHECKLIST.md` - Tool development guide
- `lib/ai/tools/README.md` - Tool catalog
- `lib/ai/CLAUDE.md` - AI SDK patterns
