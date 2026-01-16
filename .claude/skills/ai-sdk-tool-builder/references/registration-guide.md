# Tool Registration Guide (AI SDK 6)

## Overview

After creating a tool, it must be registered in the chat route to be available to AI models. This guide covers the AI SDK 6 registration process and best practices.

## Registration Location

**File**: `app/(chat)/api/chat/route.ts`

This is the main streaming chat endpoint where all tools are registered and made available to AI models via `streamText` with `createUIMessageStream`.

## Registration Steps

### Step 1: Import the Tool

Add import at the top of the file:

```typescript
// Simple tool (no factory)
import { getWeather } from '@/lib/ai/tools/get-weather';

// Factory tool
import { searchPapers } from '@/lib/ai/tools/search-papers';
```

### Step 2: Register in Tools Map

Add tool to the `tools` object within the POST handler:

```typescript
export async function POST(request: Request) {
  // ... session, dataStream setup ...

  const tools = {
    // Simple tool - direct reference
    getWeather,

    // Factory tool - call with dependencies
    searchPapers: searchPapers({ session, dataStream, chatId }),

    // Factory tool with filters (advanced)
    searchPapers: searchPapers({
      session,
      dataStream,
      chatId,
      journalFilters,
      yearFilters,
    }),

    // ... other tools
  };
}
```

### Step 3: Add to ACTIVE_TOOLS Array

**Important**: All tools available to models must be listed in `ACTIVE_TOOLS`:

```typescript
const baseTools = [
  'getWeather',
  'searchPapers',
  'analyzeDataset',
  // ... other tools
] as const;

const ACTIVE_TOOLS = [
  ...baseTools,
  ...(webSearch ? ['internetSearch' as const] : []),
];
```

### Step 4: Configure in streamText Call (AI SDK 6)

Pass tools to the AI model within `createUIMessageStream`:

```typescript
const stream = createUIMessageStream({
  execute: async ({ writer: dataStream }) => {
    const result = streamText({
      model: resolveLanguageModel(modelId),
      messages: await convertToModelMessages(messages),
      experimental_activeTools: ACTIVE_TOOLS,
      tools: {
        ...tools, // All registered tools
      },
      stopWhen: stepCountIs(48), // Multi-step control
    });

    result.consumeStream(); // CRITICAL: Required for streaming
    dataStream.merge(result.toUIMessageStream());
  },
});
```

## Registration Patterns

### Pattern 1: Simple Tool (No Factory)

```typescript
// Import
import { getWeather } from '@/lib/ai/tools/get-weather';

// Register
const tools = {
  getWeather, // ← Direct reference
};

const ACTIVE_TOOLS = ['getWeather'] as const;
```

### Pattern 2: Factory Tool (Basic)

```typescript
// Import
import { searchPapers } from '@/lib/ai/tools/search-papers';

// Register
const tools = {
  searchPapers: searchPapers({ session, dataStream }), // ← Call factory
};

const ACTIVE_TOOLS = ['searchPapers'] as const;
```

### Pattern 3: Factory Tool with Chat Context

```typescript
// Import
import { createDocument } from '@/lib/ai/tools/create-document';

// Register
const tools = {
  createDocument: createDocument({ session, dataStream, chatId }), // ← Include chatId
};

const ACTIVE_TOOLS = ['createDocument'] as const;
```

### Pattern 4: Conditional Registration

Some tools should only be available when certain conditions are met:

```typescript
// Base tools always available
const baseTools = [
  'getWeather',
  'searchPapers',
  'createDocument',
] as const;

// Conditional tool (e.g., internet search)
const ACTIVE_TOOLS = [
  ...baseTools,
  ...(webSearch ? ['internetSearch' as const] : []),
];

// Only add to tools map if enabled
const tools = {
  getWeather,
  searchPapers: searchPapers({ session, dataStream }),
  ...(webSearch && {
    internetSearch: internetSearch({ dataStream }),
  }),
};
```

## Common Registration Errors

### Error 1: Tool Not in ACTIVE_TOOLS

```typescript
// ❌ WRONG - tool not in ACTIVE_TOOLS
const tools = {
  myTool: myTool({ session, dataStream }),
};

const ACTIVE_TOOLS = [
  'otherTool',
  // Missing 'myTool'!
] as const;
```

**Fix**: Add tool name to ACTIVE_TOOLS:
```typescript
const ACTIVE_TOOLS = [
  'otherTool',
  'myTool', // ← Add here
] as const;
```

### Error 2: Factory Not Called

```typescript
// ❌ WRONG - factory tool registered directly
const tools = {
  searchPapers, // Should be: searchPapers({ session, dataStream })
};
```

**Fix**: Call the factory function:
```typescript
const tools = {
  searchPapers: searchPapers({ session, dataStream }), // ← Call factory
};
```

### Error 3: Simple Tool Called as Factory

```typescript
// ❌ WRONG - simple tool called as factory
const tools = {
  getWeather: getWeather({ session, dataStream }), // getWeather is not a factory!
};
```

**Fix**: Register simple tools directly:
```typescript
const tools = {
  getWeather, // ← Direct reference, no function call
};
```

### Error 4: Type Mismatch in ACTIVE_TOOLS

```typescript
// ❌ WRONG - tool name doesn't match
const tools = {
  searchPapers: searchPapers({ session, dataStream }),
};

const ACTIVE_TOOLS = [
  'search_papers', // Wrong name (underscore vs camelCase)
] as const;
```

**Fix**: Use exact tool name:
```typescript
const ACTIVE_TOOLS = [
  'searchPapers', // ← Match tool key exactly
] as const;
```

## Registration Checklist

Before deploying, verify:

- [ ] Tool imported at top of file
- [ ] Tool added to `tools` object
  - [ ] Simple tool: direct reference
  - [ ] Factory tool: called with correct props
- [ ] Tool name added to `ACTIVE_TOOLS` array
  - [ ] Name matches `tools` object key exactly
  - [ ] Conditional tools use spread operator
- [ ] Tool tested via chat interface
- [ ] No TypeScript errors in route file

## Type Safety

TypeScript will help catch registration errors:

```typescript
// Type error if tool not in ACTIVE_TOOLS
experimental_activeTools: ['nonexistentTool'], // ❌ Error

// Type error if factory props incorrect
searchPapers: searchPapers({ session }), // ❌ Missing dataStream

// Type error if tool name misspelled
const ACTIVE_TOOLS = ['searchPaper'] as const; // ❌ Typo
```

## Testing Registration

After registration, test the tool:

1. **Start dev server**: `pnpm dev`
2. **Open chat**: Navigate to `/chat`
3. **Trigger tool**: Send a message that should invoke the tool
4. **Check logs**: Look for tool execution in terminal
5. **Verify response**: Confirm tool returns expected data

## Advanced: Dynamic Tool Loading

For advanced use cases, tools can be loaded dynamically:

```typescript
const tools: Record<string, any> = {};

// Base tools
tools.getWeather = getWeather;
tools.searchPapers = searchPapers({ session, dataStream });

// Dynamic tools based on user permissions
if (session.user?.role === 'admin') {
  const { adminTools } = await import('@/lib/ai/tools/admin');
  tools.manageUsers = adminTools.manageUsers({ session, dataStream });
}

// Dynamic tools based on feature flags
if (process.env.ENABLE_BETA_FEATURES === 'true') {
  const { betaTools } = await import('@/lib/ai/tools/beta');
  tools.betaFeature = betaTools.betaFeature({ session, dataStream });
}
```

## Tool Priority and Ordering

**Order matters** - tools are presented to the AI model in the order listed in `ACTIVE_TOOLS`:

```typescript
const ACTIVE_TOOLS = [
  'searchPapers',      // AI will prefer this first
  'internetSearch',    // Then this
  'getWeather',        // Then this
] as const;
```

**Best practice**: List most commonly used tools first to help AI select the right tool faster.

## Debugging Registration Issues

### Check 1: Tool Appears in Network Response

In browser DevTools → Network → `/api/chat` → Response:

```json
{
  "tools": {
    "searchPapers": { ... },
    "getWeather": { ... }
  }
}
```

If tool is missing, registration failed.

### Check 2: Console Logs

Add debug logging:

```typescript
console.log('Registered tools:', Object.keys(tools));
console.log('Active tools:', ACTIVE_TOOLS);
```

### Check 3: TypeScript Compilation

Run type check:
```bash
pnpm type-check
```

Fix any errors before testing.

## Migration Notes

**Current Version**: AI SDK 6

If you see old patterns in documentation:

| Old Pattern | AI SDK 6 Pattern |
|-------------|------------------|
| `parameters: z.object({...})` | `inputSchema: z.object({...})` |
| Inline tool definitions | Import from `lib/ai/tools/` |
| `experimental_streamText` | `streamText` (stable) |
| Skip `consumeStream()` | `result.consumeStream()` (required) |

See `docs/ai-sdk-6-migration-guide.md` for historical migration details.

## Summary

Tool registration is straightforward:

1. **Import** the tool
2. **Add** to `tools` object (call factory if needed)
3. **List** in `ACTIVE_TOOLS` array
4. **Test** via chat interface

Follow the patterns above to avoid common errors and ensure tools are available to AI models.
