---
name: ai-sdk-tool-builder
description: Build AI tools using Vercel's modern AI SDK 6. Use when creating new tools for chat applications, integrating AI capabilities with external APIs or databases, or implementing tool-based AI interactions. Supports both simple stateless tools and factory-pattern tools with authentication, streaming UI updates, and chat context. Covers AI SDK 6 patterns, tool approval flows, AI Gateway configuration, Zod schema validation, tool registration patterns, and complete end-to-end examples.
---

# AI SDK Tool Builder

Build production-ready AI tools using Vercel AI SDK 6 with modern patterns, authentication, and streaming capabilities.

## When to Use This Skill

Use this skill when you need to:

- **Create new AI tools** for chat applications
- **Integrate AI capabilities** with external APIs or databases
- **Implement tool-based AI interactions** (function calling)
- **Build with AI SDK 6** modern patterns (agents, MCP, tool approval)
- **Add authentication** to AI tools
- **Stream UI updates** during tool execution
- **Configure AI Gateway** for multi-provider support

## Quick Start

### Step 1: Choose Your Tool Pattern

**Simple Tool** (no auth, stateless):
```bash
python scripts/create-tool.py get-weather simple
```

**Factory Tool with Auth**:
```bash
python scripts/create-tool.py search-data factory-auth
```

**Factory Tool with Auth + Streaming**:
```bash
python scripts/create-tool.py analyze-dataset factory-streaming
```

### Step 2: Implement the Tool

Edit the generated file and complete the TODO items:

1. Update `description` with what the tool does
2. Define `inputSchema` using Zod
3. Implement `execute` function logic
4. Add auth checks (factory tools only)
5. Emit UI events (streaming tools only)

### Step 3: Register the Tool

In `app/(chat)/api/chat/route.ts`:

```typescript
// 1. Import
import { yourTool } from '@/lib/ai/tools/your-tool';

// 2. Add to tools map
const tools = {
  // Simple tool - direct reference
  yourTool,

  // OR factory tool - call with props
  yourTool: yourTool({ session, dataStream, chatId }),
};

// 3. Add to ACTIVE_TOOLS
const ACTIVE_TOOLS = [
  'yourTool',
  // ... other tools
] as const;
```

### Step 4: Test

```bash
pnpm dev
# Navigate to /chat and test your tool
```

## Tool Patterns

### Simple Tool (Stateless)

**When to use**: External API calls, calculations, no auth required

**Example**: Weather lookup, currency conversion, data formatting

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const getWeather = tool({
  description: 'Get current weather at a location',
  inputSchema: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  execute: async ({ latitude, longitude }) => {
    const response = await fetch(`https://api.weather.com/...`);
    return await response.json();
  },
});
```

**Registration**:
```typescript
const tools = { getWeather }; // Direct reference
```

### Factory Tool with Auth

**When to use**: User-owned data, private resources, requires session

**Example**: Database queries, user profile, private documents

```typescript
import { tool, type UIMessageStreamWriter } from 'ai';
import type { AuthSession } from '@/lib/auth/types';

interface FactoryProps {
  session: AuthSession;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const searchData = ({ session, dataStream }: FactoryProps) =>
  tool({
    description: 'Search user data',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      if (!session.user?.id) {
        return { error: 'Unauthorized' };
      }
      // Search user's data
      const results = await db.search(query, session.user.id);
      return { results };
    },
  });
```

**Registration**:
```typescript
const tools = {
  searchData: searchData({ session, dataStream }), // Call factory
};
```

### Factory Tool with Streaming

**When to use**: Long operations, progress updates, multi-step processes

**Example**: Dataset analysis, file processing, complex searches

```typescript
export const analyzeData = ({ session, dataStream }: FactoryProps) =>
  tool({
    description: 'Analyze dataset with progress updates',
    inputSchema: z.object({ datasetId: z.string() }),
    execute: async ({ datasetId }) => {
      // Progress update (transient)
      dataStream.write({
        type: 'data-status',
        data: { message: 'Loading data...' },
        transient: true,
      });

      const data = await loadData(datasetId);

      // Another update
      dataStream.write({
        type: 'data-status',
        data: { message: 'Running analysis...' },
        transient: true,
      });

      const results = await analyze(data);

      // Final results (non-transient)
      dataStream.write({
        type: 'data-results',
        data: { results },
        transient: false,
      });

      return { success: true };
    },
  });
```

## AI SDK 6 Patterns

**CRITICAL**: This codebase uses AI SDK 6. Follow these patterns:

| Pattern | Implementation |
|---------|----------------|
| Tool definition | `tool({ description, inputSchema, execute })` |
| Schema parameter | `inputSchema` (NEVER `parameters`) |
| Message type | `ModelMessage` (via `convertToModelMessages`) |
| Stream consumption | `result.consumeStream()` (REQUIRED) |
| Streaming response | `createUIMessageStream` + `result.toUIMessageStream()` |
| Multi-step control | `stopWhen: stepCountIs(N)` |

See [references/ai-sdk-6-patterns.md](references/ai-sdk-6-patterns.md) for complete details.

## Current Date in Prompts

**CRITICAL**: If your tool generates prompts that include dates or date-sensitive content, always include the current date:

```typescript
import { getCurrentDatePrompt } from '@/lib/ai/prompts/prompts';

const prompt = `
${getCurrentDatePrompt()}

Your tool prompt here...
`;
```

This ensures the AI knows today's date when generating documents or making date-sensitive decisions. For document metadata dates (`generatedAt`, `lastModified`, `completedAt`), always set programmatically using `new Date().toISOString()` instead of letting the AI generate them.

## Model Selection Rules

**CRITICAL**: **NEVER hardcode AI model IDs** in tools or any code:

- **All AI model IDs must be defined** in `lib/ai/entitlements.ts` (for user-facing models) or `lib/ai/providers.ts` (for internal/system models)
- **Never hardcode model IDs** like `"xai/grok-4.1-fast-reasoning"` or `"anthropic/claude-haiku-4.5"` in tool code
- **Default behavior**: If no model is specified, always default to the user's entitlement default model (`entitlementsByUserType[userType].defaultChatModelId`)
- **Tool-specific models**: Use model IDs from entitlements (e.g., `literatureSearchModelId`, `aiExtractModelId`) when available
- **Exception**: Only use a different model if explicitly instructed by the user or in specific documented cases
- **Internal models**: Map abstract IDs (e.g., `title-model`, `artifact-model`) in `providers.ts`, never hardcode concrete model IDs

## Input Schema Best Practices

Use Zod for validation with helpful descriptions:

```typescript
z.object({
  query: z.string().min(1)
    .describe('Search query text'),

  limit: z.number().int().min(1).max(100).optional()
    .describe('Maximum results to return (default 10)'),

  year: z.number().int().nullable().optional()
    .describe('Filter by year (null for all years)'),

  category: z.enum(['research', 'news', 'blog'])
    .describe('Content category'),
})
```

**Tips**:
- Add `.describe()` to help AI understand inputs
- Set `.min()` and `.max()` for validation
- Use `.optional()` for optional fields
- Use `.nullable().optional()` for fields that can be null or undefined
- Use `z.enum()` for limited choices

## Streaming UI Events

**Event types** (from `lib/types.ts`):
- `data-status` - Progress messages (transient)
- `data-results` - Final results (non-transient)
- `data-citationsReady` - Citation data (non-transient)
- `data-webSourcesReady` - Web sources (non-transient)

**Transient vs non-transient**:
```typescript
// Transient - temporary UI update
dataStream.write({
  type: 'data-status',
  data: { message: 'Processing...' },
  transient: true, // ← Doesn't persist
});

// Non-transient - persisted data
dataStream.write({
  type: 'data-results',
  data: { results: [...] },
  transient: false, // ← Persists for UI
});
```

## Registration Checklist

Before deploying:

- [ ] Tool file created in `lib/ai/tools/`
- [ ] Input schema defined with Zod
- [ ] Description added (helps AI select tool)
- [ ] Execute function implemented
- [ ] Auth check added (if factory tool)
- [ ] Tool imported in chat route
- [ ] Tool added to `tools` object
  - [ ] Simple: direct reference
  - [ ] Factory: called with props
- [ ] Tool name in `ACTIVE_TOOLS` array
- [ ] Tested via chat interface
- [ ] No TypeScript errors

## Common Errors

### Error: Tool not registered

**Symptom**: Tool doesn't execute when AI tries to call it

**Fix**: Add tool name to `ACTIVE_TOOLS` array:
```typescript
const ACTIVE_TOOLS = [
  'yourTool', // ← Add this
] as const;
```

### Error: Factory tool not called

**Symptom**: TypeScript error or runtime error

**Fix**: Call factory function:
```typescript
// ❌ Wrong
const tools = { searchData };

// ✅ Correct
const tools = { searchData: searchData({ session, dataStream }) };
```

### Error: Simple tool called as factory

**Symptom**: TypeScript error "not a function"

**Fix**: Use direct reference for simple tools:
```typescript
// ❌ Wrong
const tools = { getWeather: getWeather({ session }) };

// ✅ Correct
const tools = { getWeather };
```

## Advanced Topics

### Conditional Tool Registration

Enable tools based on user settings:

```typescript
const baseTools = ['searchPapers', 'getWeather'] as const;

const ACTIVE_TOOLS = [
  ...baseTools,
  ...(webSearch ? ['internetSearch' as const] : []),
];

const tools = {
  searchPapers: searchPapers({ session, dataStream }),
  getWeather,
  ...(webSearch && {
    internetSearch: internetSearch({ dataStream }),
  }),
};
```

### Model Usage in Tools

**Only call models when necessary** - most tools don't need AI:

```typescript
// ✅ Good - direct data retrieval
execute: async ({ query }) => {
  const results = await database.search(query);
  return { results };
}

// ⚠️ Use sparingly - AI for query optimization
execute: async ({ userQuery }) => {
  const optimized = await generateText({
    model,
    prompt: `Optimize this query: ${userQuery}`,
  });
  const results = await database.search(optimized.text);
  return { results };
}
```

## Reference Documentation

- **[AI SDK 6 Patterns](references/ai-sdk-6-patterns.md)** - AI SDK 6 patterns, gateway config, streaming
- **[Tool Examples](references/tool-examples.md)** - Complete working examples
- **[Registration Guide](references/registration-guide.md)** - Step-by-step registration

## Tool Generation Script

Use `scripts/create-tool.py` to generate tool files:

```bash
# Simple tool
python scripts/create-tool.py <tool-name> simple

# Factory tool (no auth)
python scripts/create-tool.py <tool-name> factory

# Factory tool with auth
python scripts/create-tool.py <tool-name> factory-auth

# Factory tool with auth + streaming
python scripts/create-tool.py <tool-name> factory-streaming

# Custom output directory
python scripts/create-tool.py <tool-name> simple --output custom/path
```

## Templates

Ready-to-use TypeScript templates in `assets/templates/`:

- `simple-tool.template.ts` - Simple stateless tool
- `factory-tool.template.ts` - Factory tool with auth
- `factory-streaming-tool.template.ts` - Factory tool with auth + streaming

Placeholders: `{{TOOL_NAME}}`, `{{DESCRIPTION}}`, `{{INPUT_SCHEMA}}`, `{{IMPLEMENTATION}}`

## Security Guidelines

1. **Validate all inputs** - Use Zod schemas
2. **Check authentication** - `if (!session.user?.id)` for user data
3. **Sanitize data** - Before DB or external API calls
4. **Keep secrets server-side** - Never expose to client
5. **Rate limiting** - For expensive operations
6. **Input size limits** - Prevent abuse with `.max()`

## Testing Your Tool

1. Start dev server: `pnpm dev`
2. Navigate to `/chat`
3. Send message that triggers tool
4. Check terminal logs for execution
5. Verify response in UI
6. Test error cases (no auth, invalid input)

## Next Steps

1. Read [references/ai-sdk-6-patterns.md](references/ai-sdk-6-patterns.md) for patterns
2. Review [references/tool-examples.md](references/tool-examples.md) for examples
3. Generate a tool with `scripts/create-tool.py`
4. Implement and test your tool
5. Deploy and monitor usage

## Support

For issues or questions:
- Check reference documentation
- Review complete examples
- Verify AI SDK 6 patterns
- Ensure proper registration with `streamText` and `createUIMessageStream`
