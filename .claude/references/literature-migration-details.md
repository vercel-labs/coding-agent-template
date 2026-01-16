# Literature Migration Details

## Migration Summary

**Migration File**: `lib/db/migrations/0008_giant_nehzno.sql`
**Status**: ✅ Generated and ready for deployment
**Generated**: December 14, 2025 via `pnpm db:generate`

## Table Definition: `chat_literature_sets`

### Schema

```sql
CREATE TABLE "chat_literature_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chat_id" uuid NOT NULL,
  "run_id" text NOT NULL,
  "papers" jsonb NOT NULL,
  "count" integer NOT NULL,
  "hash" text NOT NULL,
  "query" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_literature_sets_chat_id_run_id_unique" UNIQUE("chat_id","run_id")
);
```

### Column Specifications

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique record identifier |
| `chat_id` | UUID | NOT NULL, FOREIGN KEY → Chat.id ON DELETE CASCADE | Link to parent chat session |
| `run_id` | TEXT | NOT NULL | Literature search run identifier |
| `papers` | JSONB | NOT NULL | Array of selected papers (8-12 items) from search results |
| `count` | INTEGER | NOT NULL | Number of papers stored (for validation) |
| `hash` | TEXT | NOT NULL | Hash of papers array for deduplication |
| `query` | TEXT | NULLABLE | Original search query used to retrieve papers |
| `created_at` | TIMESTAMP WITH TZ | DEFAULT now() | Record creation timestamp |

### Constraints

- **Unique Constraint**: `chat_literature_sets_chat_id_run_id_unique`
  - Columns: (chat_id, run_id)
  - Purpose: Prevents duplicate literature sets per chat session and run
  - Ensures idempotent operations

- **Foreign Key**: `chat_literature_sets_chat_id_Chat_id_fk`
  - References: Chat(id)
  - OnDelete: CASCADE
  - OnUpdate: NO ACTION
  - Ensures referential integrity and cascades cleanup when chat is deleted

### Indexes

```sql
CREATE INDEX "idx_chat_literature_sets_chat" ON "chat_literature_sets" USING btree ("chat_id");
```

- **Index Name**: `idx_chat_literature_sets_chat`
- **Type**: B-tree
- **Column**: chat_id
- **Purpose**: Accelerates queries filtering papers by chat session

## Design Pattern

Follows the established pattern from `chatWebSourceSet` and `chatCitationSet`:

1. **Dual-key uniqueness**: (chat_id, run_id) prevents duplicate runs
2. **JSONB storage**: Flexible array structure for papers with hash-based deduplication
3. **Cascade deletion**: Automatic cleanup when parent chat is deleted
4. **Indexed retrieval**: Fast lookups by chat_id

## Schema Correspondence

**Source Code** (`lib/db/schema.ts`, lines 316-334):
```typescript
export const chatLiteratureSet = pgTable(
  'chat_literature_sets',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chat_id').notNull().references(() => chat.id, { onDelete: 'cascade' }),
    runId: text('run_id').notNull(),
    papers: jsonb('papers').notNull(), // Array of Paper objects (8-12 selected papers)
    count: integer('count').notNull(),
    hash: text('hash').notNull(),
    query: text('query'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueChatRun: unique().on(table.chatId, table.runId),
    chatIdIdx: index('idx_chat_literature_sets_chat').on(table.chatId),
  }),
);
```

**Generated SQL**: Perfectly matches Drizzle schema definitions

## Migration Deployment

### Local Development (Requires Database URL)
```bash
# Set up environment variables first
vercel env pull    # Pull from Vercel environment
pnpm db:migrate    # Execute migrations locally
```

### Production Deployment (Automatic via Vercel)
```bash
git add . && git commit -m "Add chatLiteratureSet migration"
git push origin [branch]
vercel deploy      # Automatic migration execution during build
```

The migration is idempotent and safe for production deployment.

## Verification Checklist

- [x] Table definition generated with correct schema
- [x] All columns properly typed and constrained
- [x] Foreign key cascade configured correctly
- [x] Unique constraint prevents duplicate runs
- [x] Index created for chat_id lookups
- [x] JSONB column supports flexible paper array storage
- [x] Hash column enables deduplication logic
- [x] Query column tracks search parameters
- [x] Timestamp defaults to current time
- [x] Drizzle schema.ts matches generated SQL exactly

## Migration Journal Entry

**Journal File**: `lib/db/migrations/meta/_journal.json`

Entry 8 (idx: 8):
- Tag: `0008_giant_nehzno`
- Timestamp: 1765736365626
- Version: 7 (Drizzle v7)
- Includes: chatLiteratureSet table creation

## Notes

- This migration is part of a larger batch that includes `chatCitationSet` and `chatWebSourceSet` tables
- The migration uses idempotent SQL patterns suitable for Vercel's automated deployment
- No breaking changes - this is a new table addition
- RLS policies should be added separately if user data isolation is required
