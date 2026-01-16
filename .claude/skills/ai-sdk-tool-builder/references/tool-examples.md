# Complete Tool Examples (AI SDK 6)

## Example 1: Simple Stateless Tool

**Use case**: External API call, no auth required, no UI streaming

**AI SDK 6 Pattern**: Uses `tool()` with `inputSchema` and `execute`

```typescript
// lib/ai/tools/get-weather.ts
import { tool } from 'ai';
import { z } from 'zod';

export const getWeather = tool({
  description:
    'Get the current weather at a location. After this tool finishes, ALWAYS write a short final chat message summarizing the conditions.',
  inputSchema: z.object({
    latitude: z.number(),
    longitude: z.number(),
    unit: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  execute: async ({ latitude, longitude, unit }) => {
    const temperatureUnit = unit ?? 'fahrenheit';
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto&temperature_unit=${temperatureUnit}`,
    );

    const weatherData = await response.json();
    return weatherData;
  },
});
```

**Registration** (in `app/(chat)/api/chat/route.ts`):
```typescript
import { getWeather } from '@/lib/ai/tools/get-weather';

// Simple tool - no factory, register directly
const tools = {
  getWeather, // ← Direct reference
  // ... other tools
};

const ACTIVE_TOOLS = [
  'getWeather',
  // ... other tool names
] as const;
```

## Example 2: Factory Tool with Auth

**Use case**: User-owned data, requires authentication

```typescript
// lib/ai/tools/get-user-profile.ts
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { AuthSession } from '@/lib/auth/types';
import type { ChatMessage } from '@/lib/types';
import { getUserProfile } from '@/lib/db/queries';

interface FactoryProps {
  session: AuthSession;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
  fields: z.array(z.string()).optional()
    .describe('Specific profile fields to retrieve'),
});

type Input = z.infer<typeof inputSchema>;

export const getUserProfileTool = ({ session, dataStream }: FactoryProps) =>
  tool({
    description: 'Retrieve the current user\'s profile information',
    inputSchema,
    execute: async (input: Input) => {
      // Auth check required
      if (!session.user?.id) {
        return { error: 'Unauthorized: login required' };
      }

      const profile = await getUserProfile(session.user.id, input.fields);

      if (!profile) {
        return { error: 'Profile not found' };
      }

      return {
        success: true,
        profile: {
          name: profile.name,
          email: profile.email,
          institution: profile.institution,
          // ... other fields
        },
      };
    },
  });
```

**Registration**:
```typescript
import { getUserProfileTool } from '@/lib/ai/tools/get-user-profile';

// Factory tool - call with session
const tools = {
  getUserProfile: getUserProfileTool({ session, dataStream }), // ← Call factory
  // ... other tools
};
```

## Example 3: Factory Tool with UI Streaming

**Use case**: Long-running operation with progress updates

```typescript
// lib/ai/tools/analyze-dataset.ts
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { AuthSession } from '@/lib/auth/types';
import type { ChatMessage } from '@/lib/types';

interface FactoryProps {
  session: AuthSession;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
  datasetId: z.string().min(1).describe('Dataset ID to analyze'),
  analysisType: z.enum(['summary', 'regression', 'classification'])
    .describe('Type of analysis to perform'),
});

type Input = z.infer<typeof inputSchema>;

export const analyzeDataset = ({ session, dataStream }: FactoryProps) =>
  tool({
    description: 'Perform statistical analysis on a dataset',
    inputSchema,
    execute: async (input: Input) => {
      if (!session.user?.id) {
        return { error: 'Unauthorized' };
      }

      // Step 1: Loading
      dataStream.write({
        type: 'data-status',
        data: { message: 'Loading dataset...' },
        transient: true, // Temporary message
      });

      const dataset = await loadDataset(input.datasetId, session.user.id);

      // Step 2: Processing
      dataStream.write({
        type: 'data-status',
        data: { message: 'Running analysis...' },
        transient: true,
      });

      const results = await performAnalysis(dataset, input.analysisType);

      // Step 3: Final results (non-transient)
      dataStream.write({
        type: 'data-results',
        data: {
          analysisType: input.analysisType,
          summary: results.summary,
          charts: results.charts,
        },
        transient: false, // Persisted data
      });

      return {
        success: true,
        datasetId: input.datasetId,
        recordsAnalyzed: dataset.length,
        results: results.summary,
      };
    },
  });
```

## Example 4: Tool with External API Integration

**Use case**: FRED economic data, requires API key

```typescript
// lib/ai/tools/fred-search.ts
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { ChatMessage } from '@/lib/types';

interface FactoryProps {
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
  searchText: z.string().min(1)
    .describe('Search query for FRED economic data series'),
  limit: z.number().int().min(1).max(100).optional()
    .describe('Maximum results to return (default 20)'),
});

type Input = z.infer<typeof inputSchema>;

export const fredSearch = ({ dataStream }: FactoryProps) =>
  tool({
    description: 'Search Federal Reserve Economic Data (FRED) series by keyword',
    inputSchema,
    execute: async ({ searchText, limit = 20 }: Input) => {
      const apiKey = process.env.FRED_API_KEY;

      if (!apiKey) {
        return {
          error: 'FRED API not configured',
          message: 'Contact administrator to enable FRED integration',
        };
      }

      const url = `https://api.stlouisfed.org/fred/series/search?search_text=${encodeURIComponent(searchText)}&limit=${limit}&api_key=${apiKey}&file_type=json`;

      const response = await fetch(url);

      if (!response.ok) {
        return {
          error: 'FRED API error',
          status: response.status,
        };
      }

      const data = await response.json();

      return {
        success: true,
        series: data.seriess || [],
        count: data.seriess?.length || 0,
      };
    },
  });
```

## Example 5: Database Search with Vector Embeddings

**Use case**: Academic paper search with hybrid search (keyword + semantic)

```typescript
// lib/ai/tools/search-papers.ts
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { AuthSession } from '@/lib/auth/types';
import type { ChatMessage } from '@/lib/types';
import { findRelevantContentSupabase } from '@/lib/ai/supabase-retrieval';
import { storeCitationIds } from '@/lib/citations/store';

interface FactoryProps {
  session: AuthSession;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  chatId?: string;
}

const inputSchema = z.object({
  query: z.string().min(1).describe('Search query text'),
  matchCount: z.number().int().min(1).max(20).optional()
    .describe('Number of results to return (default 15)'),
  minYear: z.number().int().nullable().optional()
    .describe('Minimum publication year filter'),
  maxYear: z.number().int().nullable().optional()
    .describe('Maximum publication year filter'),
});

type Input = z.infer<typeof inputSchema>;

export const searchPapers = ({ session, dataStream, chatId }: FactoryProps) =>
  tool({
    description:
      'Search academic research papers via Supabase hybrid search. Returns papers with DOI/OpenAlex links.',
    inputSchema,
    execute: async ({ query, matchCount = 15, minYear, maxYear }: Input) => {
      // Status update
      dataStream.write({
        type: 'data-status',
        data: { message: 'Searching academic papers...' },
        transient: true,
      });

      // Perform hybrid search (keyword + semantic)
      const results = await findRelevantContentSupabase(query, {
        matchCount,
        minYear: minYear ?? undefined,
        maxYear: maxYear ?? undefined,
      });

      // Store citation IDs for later reference
      if (chatId && results.length > 0) {
        const citationIds = results.map((r) => r.id);
        await storeCitationIds(chatId, citationIds);

        dataStream.write({
          type: 'data-citationsReady',
          data: { citationIds },
          transient: false, // Persist for UI
        });
      }

      return {
        success: true,
        results: results.map((r) => ({
          title: r.title,
          authors: r.authors,
          year: r.year,
          abstract: r.abstract,
          doi: r.doi,
          url: r.url,
          citationId: r.id,
        })),
        count: results.length,
      };
    },
  });
```

## Example 6: Tool with AI Model Call

**Use case**: Query optimization before database search

```typescript
// lib/ai/tools/optimized-search.ts
import { tool, generateText, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { ChatMessage } from '@/lib/types';
import { myProvider } from '@/lib/ai/providers';

interface FactoryProps {
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const inputSchema = z.object({
  userQuery: z.string().min(1).describe('User\'s natural language query'),
});

type Input = z.infer<typeof inputSchema>;

export const optimizedSearch = ({ dataStream }: FactoryProps) =>
  tool({
    description: 'Optimize a search query using AI, then perform the search',
    inputSchema,
    execute: async ({ userQuery }: Input) => {
      // Use AI to optimize query
      const model = myProvider.languageModel('chat-model');

      const { text: optimizedQuery } = await generateText({
        model,
        prompt: `Convert this natural language query into optimized search keywords:

User query: "${userQuery}"

Return only the optimized keywords, nothing else.`,
      });

      dataStream.write({
        type: 'data-status',
        data: {
          message: `Optimized query: "${optimizedQuery}"`,
        },
        transient: true,
      });

      // Now search with optimized query
      const results = await performSearch(optimizedQuery);

      return {
        success: true,
        originalQuery: userQuery,
        optimizedQuery,
        results,
      };
    },
  });
```

## Common Patterns Summary

### Pattern Selection Guide

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **Simple Tool** | External API, no auth, stateless | `getWeather` |
| **Factory + Auth** | User-owned data, private resources | `getUserProfile` |
| **Factory + Streaming** | Long operations, progress updates | `analyzeDataset` |
| **Factory + Chat Context** | Citation tracking, chat-specific data | `searchPapers` |
| **AI Model Integration** | Query optimization, content analysis | `optimizedSearch` |

### Return Value Patterns

**Success**:
```typescript
return {
  success: true,
  data: { ... },
  metadata: { ... },
};
```

**Error**:
```typescript
return {
  error: 'Error message',
  code: 'error_code', // Optional
  details: { ... }, // Optional
};
```

**Partial Success**:
```typescript
return {
  success: true,
  results: [...],
  errors: [...], // Some items failed
  warnings: [...], // Optional
};
```
