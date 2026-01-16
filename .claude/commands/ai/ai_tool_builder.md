---
description: "Build, test, and integrate new AI tools for the chat system"
argument-hint: "[tool name or purpose]"
allowed-tools: Read(*), Write(lib/ai/tools/*), Bash(pnpm verify:ai-sdk)
---

# 🛠️ AI Tool Development: $ARGUMENTS

## Tool Development Framework

### Phase 1: Tool Design & Planning 📋

**Tool Specification**:
- **Purpose**: What specific task does this tool accomplish?
- **Input Parameters**: What data does it need from the user/AI?
- **Output Format**: What does it return to the AI and user?
- **Integration Points**: How does it fit with existing tools?
- **Performance Requirements**: Speed, reliability, error handling

**Examine Existing Tools**:
```typescript
// Reference patterns from existing tools:
// - lib/ai/tools/create-document.ts (artifact creation)
// - lib/ai/tools/search-papers.ts (RAG integration) 
// - lib/ai/tools/fred-series.ts (external API integration)
// - lib/ai/tools/process-pdf.ts (file processing)
```

### Phase 2: Tool Implementation 🔧

**Standard Tool Structure**:
```typescript
// lib/ai/tools/$ARGUMENTS.ts
import { z } from 'zod';
import type { ToolExecuteFunction } from '@/lib/ai/types';

export const toolName = {
  // AI SDK 5 pattern: inputSchema (NOT parameters)
  inputSchema: z.object({
    // Define input parameters with validation
    parameter1: z.string().min(1).describe('Description for AI'),
    parameter2: z.number().optional().describe('Optional parameter'),
    // Use .describe() to help AI understand parameter purpose
  }),

  execute: async ({ input, dataStream, context }) => {
    // Access user session and database through context
    const { session } = context;
    
    // Provide progress updates via dataStream
    dataStream.write({
      type: 'progress',
      content: 'Starting tool execution...'
    });

    try {
      // Core tool logic here
      const result = await performToolOperation(input);

      // Success data stream update
      dataStream.write({
        type: 'progress', 
        content: `Successfully completed ${input.parameter1}`
      });

      return {
        success: true,
        data: result,
        message: 'Tool executed successfully'
      };

    } catch (error) {
      // Error handling and user feedback
      dataStream.write({
        type: 'error',
        content: `Failed to execute tool: ${error.message}`
      });

      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }
} satisfies ToolExecuteFunction;
```

### Phase 3: Tool Integration 🔗

**Register Tool in Chat Route**:
```typescript
// Add to app/(chat)/api/chat/route.ts ACTIVE_TOOLS array
import { toolName } from '@/lib/ai/tools/$ARGUMENTS';

const ACTIVE_TOOLS = [
  // ... existing tools
  toolName,
] as const;
```

**Tool Access Control**:
- [ ] **User Entitlements**: Check if tool should be gated by user type
- [ ] **Model Compatibility**: Works with both reasoning and non-reasoning models
- [ ] **Rate Limiting**: Consider if tool needs usage limits
- [ ] **Error Boundaries**: Graceful failure without breaking chat

### Phase 4: UI Integration 🎨

**Tool Result Rendering**:
```typescript
// Add custom renderer in components/message.tsx if needed
// Or rely on generic tool UI for standard input/output display

// For complex tool results, create specific UI components
// Follow patterns from existing tool renderers
```

**Progress Indication**:
- Use `dataStream.write()` for real-time progress updates
- Provide meaningful status messages
- Handle both success and error states gracefully

### Phase 5: Testing & Validation ✅

**Tool Testing Checklist**:
- [ ] **Input Validation**: Test with invalid/edge case inputs
- [ ] **Error Handling**: Verify graceful error responses  
- [ ] **Performance**: Test with large inputs or slow operations
- [ ] **Integration**: Test within actual chat conversations
- [ ] **Multiple Models**: Test with different AI providers
- [ ] **Concurrent Usage**: Test multiple simultaneous tool calls

**AI SDK 5 Compliance**:
```bash
# Verify no deprecated patterns
pnpm verify:ai-sdk
```

## Tool Categories & Patterns

### External API Integration
```typescript
// Pattern: HTTP requests with proper error handling
const response = await fetch(apiUrl, {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

if (!response.ok) {
  throw new Error(`API error: ${response.status}`);
}
```

### Database Operations  
```typescript
// Pattern: Use context for database access
const { db } = context;
const results = await db.select().from(table).where(condition);
```

### File Processing
```typescript  
// Pattern: Handle file uploads and processing
const fileContent = await processFile(input.file);
dataStream.write({ type: 'file-processed', content: fileContent });
```

### RAG Integration
```typescript
// Pattern: Vector search and knowledge retrieval
const searchResults = await hybridSearchPapers(input.query, 10);
return { papers: searchResults, relevance: 'high' };
```

## Advanced Tool Features

### Streaming Operations
```typescript
// For long-running operations, provide regular updates
for (const step of longRunningProcess) {
  dataStream.write({ 
    type: 'progress', 
    content: `Processing step ${step.index}/${step.total}` 
  });
  
  await processStep(step);
}
```

### Error Recovery
```typescript
// Implement retry logic and fallbacks
const maxRetries = 3;
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    return await riskyOperation();
  } catch (error) {
    if (attempt === maxRetries - 1) throw error;
    
    dataStream.write({
      type: 'progress',
      content: `Retry attempt ${attempt + 1}/${maxRetries}`
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
  }
}
```

### Context-Aware Operations
```typescript
// Use chat/user context for personalized results
const { session, chatId } = context;
const userPreferences = await getUserPreferences(session.user.id);
const chatHistory = await getChatContext(chatId);
```

## Tool Development Focus: $ARGUMENTS

Begin developing the tool based on the specification above:

1. **Define Requirements**: What exactly should this tool accomplish?
2. **Choose Pattern**: Which existing tool pattern is most similar?
3. **Implement Core Logic**: Focus on the main functionality first
4. **Add Progress Updates**: Keep users informed during execution
5. **Handle Errors Gracefully**: Provide meaningful error messages
6. **Test Integration**: Verify it works within the chat flow
7. **Optimize Performance**: Ensure fast, reliable execution

Start building: **$ARGUMENTS**
