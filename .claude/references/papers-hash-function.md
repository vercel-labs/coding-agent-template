# Papers Hash Function Implementation

## Purpose
Create a hash from PaperSearchResult array for deduplication and tracking in `insertChatLiteratureSet`.

## Implementation
```typescript
import { createHash } from 'crypto';
import type { PaperSearchResult } from '@/lib/types';

/**
 * Create hash from papers for deduplication
 * Hash is based on normalized openalexIds (consistent ordering)
 */
export function createPapersHash(papers: PaperSearchResult[]): string {
  // Sort by openalexId for consistent hashing
  const normalizedIds = papers
    .map(p => p.id || p.openalexId || '')
    .filter(id => id.length > 0)
    .sort()
    .join('|');

  const hash = createHash('sha256').update(normalizedIds).digest('hex');
  return hash.substring(0, 16); // First 16 chars
}
```

## Pattern Reference
Mirrors `createWebSourcesHash` from `lib/citations/web-source-store-server.ts`:
- Uses SHA-256 hash
- Normalizes and sorts data for consistency
- Returns first 16 characters (16-char hex string)
- Handles missing IDs with filtering

## Integration Point
Used in `lib/ai/tools/literature-search.ts` at line ~328 with `insertChatLiteratureSet`:
```typescript
await insertChatLiteratureSet({
  chatId,
  runId,
  papers: selectedPapers,
  count: selectedPapers.length,
  hash: createPapersHash(selectedPapers),
  query: researchQuestion
}).catch((error: Error) => {
  console.error('[literatureSearch] Failed to persist:', error);
});
```
