# AI SDK 6 Patterns & Best Practices

## Core AI SDK 6 Patterns

**Current Version**: This codebase uses AI SDK 6 (as of January 2026)

### 1. Tool Definition Pattern

All tools use the `tool()` function with three required properties:

```typescript
import { tool } from ''ai'';
import { z } from ''zod'';

export const myTool = tool({
  description: ''What the tool does'',
  inputSchema: z.object({ /* Zod schema */ }),
  execute: async (input) => { /* Implementation */ },
});
```

**NEVER** use `parameters` - AI SDK 6 requires `inputSchema`.

### 2. Streaming Pattern (createUIMessageStream)

The codebase uses `createUIMessageStream` for all chat streaming:

```typescript
import { streamText, createUIMessageStream, stepCountIs } from ''ai'';

const stream = createUIMessageStream({
  execute: async ({ writer: dataStream }) => {
    const result = streamText({
      model: resolveLanguageModel(modelId),
      system: systemPrompt({ /* context */ }),
      messages: await convertToModelMessages(uiMessages),
      tools: { /* tool objects */ },
      stopWhen: stepCountIs(48), // Multi-step limit
    });

    result.consumeStream(); // CRITICAL: Must call this

    dataStream.merge(result.toUIMessageStream({
      sendReasoning: reasoningLevel !== ''none'',
    }));
  },
  onFinish: async ({ messages }) => {
    // Save messages to database
  },
});

return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
```

**Key Points**:
- `result.consumeStream()` is **REQUIRED** for streaming to work
- `dataStream.merge()` combines tool outputs with text generation
- `toUIMessageStream()` converts to UI format with optional reasoning
- `JsonToSseTransformStream` converts to Server-Sent Events format

### 3. Multi-Step Control

Use `stopWhen` to control multi-step tool execution:

```typescript
stopWhen: stepCountIs(48), // Allow up to 48 steps
```

**Options**:
- `stepCountIs(N)` - Stop after N steps
- `hasToolCall(''toolName'')\ - Stop when specific tool is called
- Custom condition function

### 4. Active Tools

Filter available tools per request using `experimental_activeTools`:

```typescript
const ACTIVE_TOOLS = [
  ''searchPapers'',
  ''createDocument'',
  ''getWeather'',
  ...(webSearch ? [''internetSearch'' as const] : []),
] as const;

streamText({
  // ...
  experimental_activeTools: ACTIVE_TOOLS,
  tools: { /* all registered tools */ },
});
```

## Tool Pattern Types

### Pattern 1: Simple Tool (Stateless)

Use when tool doesn'''t need auth, streaming UI events, or chat context.

```typescript
import { tool } from ''ai'';
import { z } from ''zod'';

export const getWeather = tool({
  description: ''Get current weather at a location'',
  inputSchema: z.object({
    latitude: z.number(),
    longitude: z.number(),
    unit: z.enum([''celsius'', ''fahrenheit'']).optional(),
  }),
  execute: async ({ latitude, longitude, unit }) => {
    const response = await fetch(`https://api.weather.com/...`);
    return await response.json();
  },
});
```

**Registration**:
```typescript
const tools = { getWeather }; // Direct reference
```

See [tool-examples.md](tool-examples.md) and [registration-guide.md](registration-guide.md) for more patterns.

## Additional Resources

- **[Tool Examples](tool-examples.md)** - Complete working examples
- **[Registration Guide](registration-guide.md)** - Step-by-step registration
- **[Migration Guide](../../../docs/ai-sdk-6-migration-guide.md)** - Historical SDK 5 → 6 migration
