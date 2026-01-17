# Agent Rewrite Summary - Contamination Removal

**Date:** January 17, 2026
**Status:** COMPLETE
**Impact:** 3 agents rewritten to align with AA Coding Agent platform architecture

---

## Executive Summary

Three agent definition files contained contamination from the "Orbis" project, a different AI application with distinct architecture. All references to Orbis have been removed, and agents have been completely rewritten to focus on AA Coding Agent-specific patterns, tools, and security concerns.

---

## Files Rewritten

### 1. `.claude/agents/security-expert.md`

**Previous Issues:**
- Referenced chat streaming, artifacts, guest users (Orbis-specific features)
- Mentioned Vector DB/pgvector (doesn't exist in AA)
- Discussed dual database architecture (only single PostgreSQL DB in AA)
- Included RLS policies for non-existent chat tables

**New Focus Areas:**
- **Vercel Sandbox Security**: Command injection prevention, timeout enforcement, untrusted code execution
- **Credential Protection**: GitHub OAuth tokens, API key encryption, Vercel sandbox credentials
- **Static-String Logging** (CRITICAL): Enforce no dynamic values in logs, prevent data leakage
- **API Token Management**: SHA256 hashing, Bearer authentication, token rotation
- **Data Encryption**: AES-256-CBC for OAuth tokens, API keys, MCP environment variables
- **User Data Isolation**: userId filtering, foreign key constraints, cross-user access prevention
- **MCP Server Security**: Local CLI validation, remote HTTP endpoint validation
- **Rate Limiting & DoS Prevention**: 20/day standard, 100/day admin limits

**Key Changes:**
- Removed Orbis references (line 96 footer)
- Replaced attack surface with actual AA threats (sandbox execution, credential handling)
- Updated security audit checklist with relevant table names (users, tasks, connectors, keys, apiTokens, taskMessages)
- Focused on real security patterns: Vercel credentials, GitHub tokens, API key storage, MCP integration
- Added specific file references: `lib/utils/logging.ts`, `lib/sandbox/agents/claude.ts`, `lib/db/schema.ts`

**Line Count:** 113 lines (was 96, increased by 17% with more detail)

---

### 2. `.claude/agents/supabase-expert.md`

**Previous Issues:**
- Emphasized "dual database architecture" with separate Vector DB/pgvector (doesn't exist in AA)
- Referenced pgvector, vector search, embeddings, academic papers (Orbis-specific features)
- Mentioned complex migration patterns for two separate databases
- Focused on Supabase Auth + SDK patterns (not used in AA)

**New Focus Areas:**
- **PostgreSQL + Drizzle ORM**: Type-safe queries, parameterized statements, schema design
- **User Isolation**: All tables have userId; every query filters by `eq(table.userId, user.id)`
- **Encryption at Rest**: OAuth tokens, API keys, MCP environment variables all encrypted
- **Safe Migrations**: Drizzle-kit workflow, IF NOT EXISTS patterns, dependency ordering
- **RLS Policies**: Multi-tenant security for users, tasks, keys, connectors, apiTokens, taskMessages
- **Schema Patterns**: Foreign key constraints, JSONB for logs, unique constraints per user

**Key Changes:**
- Removed all Vector DB references (pgvector, embeddings, academic papers)
- Removed "dual database" concept entirely
- Updated core tables list to actual schema: users, accounts, keys, apiTokens, tasks, taskMessages, connectors, settings
- Added real encryption patterns: `encrypt()` for tokens/keys, SHA256 hashing for external tokens
- Included actual Drizzle query patterns with userId filtering
- Focused on single PostgreSQL database with Drizzle ORM (NOT Supabase SDK for queries)
- Added migration workflow specific to AA: `pnpm db:generate` + Vercel auto-deployment

**Line Count:** 238 lines (was 75, increased 217% with comprehensive patterns and examples)

---

### 3. `.claude/agents/shadcn-ui-expert.md`

**Previous Issues:**
- Directly referenced "Orbis platform" (line 11)
- Mentioned iPhone 15 Pro specific viewport metrics (393×680px) - not applicable to AA
- Referenced "Unified Tool Display system" in components/tools/ (doesn't exist in AA)
- Focused on dynamic responsive sizing patterns not used in AA
- Referenced New York v4 variant without context for AA usage

**New Focus Areas:**
- **shadcn/ui Primitives**: Button, Dialog, Input, Select, Textarea, Card, Badge, Tabs, Table, Dropdown, Tooltip, Toast, Progress
- **Task Execution UI**: Task form (790 lines), API keys dialog (598 lines), task chat, file browser, log display
- **Responsive Design**: Mobile-first approach with lg: = 1024px desktop threshold (AA's actual breakpoint)
- **Jotai State Integration**: Global atoms for taskPrompt, selectedAgent, selectedModel, session
- **WCAG AA Accessibility**: Keyboard navigation, labels, focus states, 44px+ touch targets
- **Form Patterns**: Task creation forms, API key inputs, repository selection

**Key Changes:**
- Removed "Orbis platform" reference entirely
- Removed iPhone 393×680px viewport metric (replaced with actual AA breakpoints: lg: 1024px)
- Removed "Unified Tool Display system" references
- Rewrote with actual AA component examples: task-form.tsx, api-keys-dialog.tsx, task-chat.tsx, file-browser.tsx, repo-layout.tsx
- Added Jotai atom patterns specific to AA state management
- Included real responsive design rules using AA's actual Tailwind v4 setup
- Focused on task execution UI patterns, not multi-tool orchestration

**Line Count:** 323 lines (was 59, increased 447% with comprehensive patterns, component examples, and implementation guidance)

---

## Key Architectural Patterns Added

### Security Expert
- Vercel Sandbox execution environment (untrusted code)
- External API token hashing (SHA256)
- MCP server validation (local vs remote)
- Redaction patterns validation
- Rate limiting enforcement

### Supabase/Database Expert
- User-scoped queries (userId filtering on all tables)
- Encryption at rest (OAuth tokens, API keys, MCP env vars)
- Drizzle ORM parameterized queries
- Safe migration workflow via drizzle-kit
- JSONB logs pattern (real-time updates)

### shadcn/ui Expert
- Actual component library (21 existing components in `components/ui/`)
- Jotai atom patterns for global state
- Responsive design with lg: 1024px threshold
- Task execution UI (not chat/artifact UI)
- Accessibility standards (WCAG AA)

---

## Contamination Removed

| Item | Old Value | New Value |
|------|-----------|-----------|
| Referenced Project | Orbis (chat/artifact platform) | AA Coding Agent (task execution platform) |
| Database Architecture | Dual DB (App + Vector) with pgvector | Single PostgreSQL with Drizzle ORM |
| Authentication Model | Supabase Auth + UUID guest users | OAuth (GitHub, Vercel) + encrypted tokens |
| Attack Surfaces | Chat streaming, artifacts, file uploads | Sandbox execution, credential handling, MCP servers |
| UI Viewport Target | iPhone 393×680px | Responsive with lg: 1024px desktop threshold |
| Component System | "Unified Tool Display" | Actual shadcn/ui components from components/ui/ |
| State Management | Implied Context API | Jotai atoms (@lib/atoms/) |
| Migration Pattern | Supabase SQL migrations + Drizzle | Drizzle-kit only with IF NOT EXISTS safety |
| Logging Focus | General security best practices | Static-string enforcement (no dynamic values) |

---

## Verification Checklist

- [x] **security-expert.md**: All Orbis references removed; focused on Vercel Sandbox, API tokens, MCP security
- [x] **supabase-expert.md**: All Vector DB/pgvector references removed; single PostgreSQL + Drizzle focus
- [x] **shadcn-ui-expert.md**: Orbis platform reference removed; iPhone viewport removed; actual AA components documented
- [x] **Cross-references verified**: All @lib/*, @components/*, @app/api/* paths checked against actual codebase
- [x] **Pattern consistency**: All three agents aligned with CLAUDE.md, AGENTS.md, and other production agents
- [x] **Code examples**: All TypeScript/SQL examples use actual AA patterns
- [x] **Length targets**: All agents appropriately sized (113, 238, 323 lines) - concise but comprehensive

---

## Integration Notes

These rewritten agents now work seamlessly with existing agents in `.claude/agents/`:

- **security-expert** ↔ **security-logging-enforcer**: Coordinate on logging compliance and encryption audits
- **supabase-expert** ↔ **database-schema-optimizer**: Work together on schema changes and migrations
- **shadcn-ui-expert** ↔ **react-component-builder**: Complementary approaches to component development

All three agents are now production-ready and reflect the actual AA Coding Agent platform architecture.

---

## Files Modified

1. `/home/user/AA-coding-agent/.claude/agents/security-expert.md` - Rewritten (113 lines)
2. `/home/user/AA-coding-agent/.claude/agents/supabase-expert.md` - Rewritten (238 lines)
3. `/home/user/AA-coding-agent/.claude/agents/shadcn-ui-expert.md` - Rewritten (323 lines)

---

**Status: READY FOR PRODUCTION**
