/**
 * {{WORKFLOW_TITLE}} Analysis API Route
 *
 * Handles AI-powered step execution for the {{workflow_slug}} workflow.
 * POST /api/{{workflow_slug}}/analyze
 */

import { NextRequest, NextResponse } from 'next/server'
import { WORKFLOW_SPEC } from '@/lib/workflows/{{workflow_slug}}/spec'
import type { AnalysisRequest, AnalysisResponse } from '@/lib/workflows/{{workflow_slug}}/types'
import { getServerAuth } from '@/lib/auth/server'
import { getCurrentDatePrompt } from '@/lib/ai/prompts/prompts' // ✅ CRITICAL: Include current date in prompts
import { robustGenerateObject } from '@/lib/workflows/schema-repair' // ✅ CRITICAL: Use schema repair utility for automatic error handling
import { resolveLanguageModel } from '@/lib/ai/providers'

// Example tool integrations (uncomment as needed):
// import { findRelevantContentSupabase, isSupabaseConfigured } from "@/lib/ai/supabase-retrieval"; // For academic search
// import { getServiceClient } from "@/lib/supabase/service"; // For direct Supabase access
// import { getInternetSearchModel } from "@/lib/ai/models";
// import { internetSearchPrompt } from "@/lib/ai/prompts/prompts";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { session } = await getServerAuth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request
    const body: AnalysisRequest = await request.json()
    const { step, modelId, input, context } = body

    if (!step || !modelId) {
      return NextResponse.json({ success: false, error: 'Missing required fields: step, modelId' }, { status: 400 })
    }

    // Find step config
    const stepConfig = WORKFLOW_SPEC.steps.find((s) => s.id === step)
    if (!stepConfig) {
      return NextResponse.json({ success: false, error: `Invalid step: ${step}` }, { status: 400 })
    }

    // Validate input with step schema
    const validationResult = stepConfig.inputSchema.safeParse(input)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid input: ${validationResult.error.message}`,
        },
        { status: 400 },
      )
    }

    // Execute step-specific analysis
    let result

    switch (step) {
      case 'step1': {
        result = await analyzeStep1(modelId, validationResult.data, context)
        break
      }

      default:
        return NextResponse.json({ success: false, error: `Unimplemented step: ${step}` }, { status: 501 })
    }

    // Validate output with Zod schema (critical for type safety)
    // The client also validates outputs, but server-side validation
    // prevents malformed data from being persisted or returned to the client.
    const outputValidation = stepConfig.outputSchema.safeParse(result)
    if (!outputValidation.success) {
      console.error('Output validation failed:', outputValidation.error)
      return NextResponse.json(
        {
          success: false,
          error: 'AI output did not match expected schema',
        },
        { status: 500 },
      )
    }

    return NextResponse.json<AnalysisResponse>({
      success: true,
      data: outputValidation.data,
    })
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json<AnalysisResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
      },
      { status: 500 },
    )
  }
}

/**
 * Step 1 analysis implementation
 */
async function analyzeStep1(modelId: string, input: any, context?: any): Promise<any> {
  const stepConfig = WORKFLOW_SPEC.steps.find((s) => s.id === 'step1')!

  // ✅ Use robustGenerateObject for automatic schema validation error handling
  // This wrapper handles Zod validation errors, repair attempts, and fallback automatically
  const result = await robustGenerateObject({
    stepTag: '{{workflow_slug}}:step1',
    modelId,
    model: resolveLanguageModel(modelId),
    schema: stepConfig.outputSchema,
    prompt: `
${getCurrentDatePrompt()}

You are analyzing data for step 1 of the {{workflow_slug}} workflow.

Input: ${JSON.stringify(input, null, 2)}

Provide your analysis following the required schema.
    `.trim(),
  })

  return result
}
// Add more step analysis functions + switch cases as you add steps to WORKFLOW_SPEC.

/**
 * INTEGRATION EXAMPLES
 *
 * These examples show how to integrate common patterns into your workflow steps.
 * All examples use proper Zod validation and error handling.
 *
 * === Academic Search Integration ===
 * For workflows that need to search academic papers:
 *
 * import { findRelevantContentSupabase, isSupabaseConfigured } from "@/lib/ai/supabase-retrieval";
 *
 * async function analyzeSearchStep(session: Session, input: any) {
 *   if (!isSupabaseConfigured()) {
 *     return { papers: [], totalFound: 0 };
 *   }
 *
 *   const results = await findRelevantContentSupabase(input.query, {
 *     matchCount: 10,
 *     minYear: input.yearFilter?.start,
 *     maxYear: input.yearFilter?.end,
 *   });
 *
 *   return {
 *     papers: results.map(r => ({
 *       id: r.key,
 *       title: (r as any).title || r.name.split('\n')[0],
 *       authors: (r as any).authors || [],
 *       similarity: r.similarity,
 *     })),
 *   };
 * }
 *
 * === Web Search Integration ===
 * For workflows that need real-time web search:
 *
 * // Use the internetSearch tool - see lib/ai/tools/internet-search.ts
 * // This requires the tool to be registered in the chat route
 *
 * === Document Generation ===
 * For workflows that create/edit documents:
 *
 * import { createDocument, updateDocument } from "@/lib/artifacts/server";
 *
 * async function analyzeGenerateStep(modelId: string, input: any, context: any) {
 *   // Generate document content
 *   // ✅ Use robustGenerateObject for automatic schema validation error handling
 *   const result = await robustGenerateObject({
 *     stepTag: "{{workflow_slug}}:generate",
 *     modelId,
 *     model: resolveLanguageModel(modelId),
 *     schema: z.object({ content: z.string() }),
 *     prompt: `
 * ${getCurrentDatePrompt()}
 *
 * Generate content for: ${input.topic}
 *     `.trim(),
 *   });
 *
 *   // Override AI-generated dates with actual current date if needed
 *   // Example: return { ...result, documentMetadata: { ...result.documentMetadata, generatedAt: new Date().toISOString() } };
 *
 *   return { generatedContent: result.content };
 * }
 *
 * === Streaming Progress ===
 * For long-running operations:
 *
 * // TODO: Add streaming support using Server-Sent Events
 * // See docs/ai-sdk-5/guides/ for streaming patterns
 */
