---
description: "Load comprehensive context about the Next.js AI chat codebase architecture"
argument-hint: "[optional: specific area like 'ai', 'database', 'frontend', 'tools']"
allowed-tools: Read(*), Bash(find . -name "*.ts" -o -name "*.tsx" | head -20), Bash(git log --oneline -5)
---

# 🏗️ Codebase Architecture Context $ARGUMENTS

## Repository Overview
- **Recent Activity**: !`git log --oneline -10`
- **Key Files**: !`find . -name "*.ts" -o -name "*.tsx" -type f | grep -E "(route|provider|schema)" | head -10`

## Complete System Architecture

### 🚀 **Core Technology Stack**
```typescript
// Next.js 15.3.0-canary.31 with App Router + experimental PPR
// React 19 RC with modern hooks and concurrent features
// TypeScript 5+ with strict typing and advanced patterns
// Tailwind CSS + shadcn/ui components + Radix primitives
// Biome for linting/formatting (not ESLint/Prettier)
```

### 🤖 **AI Integration Architecture**

**Central AI System** (`lib/ai/`):
- **`providers.ts`**: AI Gateway configuration with vendor mappings
- **`models.ts`**: Abstract model definitions (chat-model, reasoning models)
- **`tools/`**: 10+ AI tools with Zod schemas and execute functions
- **`prompts.ts`**: System prompts and templates
- **`embedding.ts`**: Vector operations for RAG system

**Key AI Patterns**:
```typescript
// AI SDK 5.0+ patterns (NOT v4)
import { streamText, createUIMessageStream } from 'ai';
import { gateway } from '@ai-sdk/gateway'; // Single provider interface

// Tool structure (NOT parameters - that's v4)
export const toolName = {
  inputSchema: z.object({...}), // Zod validation
  execute: async ({ input, dataStream, context }) => {...}
};
```

### 🗄️ **Dual Database Architecture**

**1. Application Database** (`lib/db/` - Drizzle ORM):
```typescript
// Core tables: User, Chat, Message_v2, Document, Suggestion, Vote_v2
// Drizzle schema with PostgreSQL backend
// Handles: User sessions, chat history, artifacts, voting
```

**2. RAG Vector System** (`lib/supabase/` - Direct Supabase):
```typescript  
// Tables: academic_documents, journals, authors, ai_topic_definitions
// pgvector extension with HNSW indexes
// Handles: large research corpus, vector search, AI classification
```

### 🎨 **Frontend Architecture**

**App Router Structure**:
```
app/
├── (auth)/          # Authentication routes with shared layout
├── (chat)/          # Main chat app with sidebar layout  
├── globals.css      # Tailwind and custom styles
└── layout.tsx       # Root layout with providers
```

**Key Components** (`components/`):
- **`message.tsx`**: Complex message rendering with citations (900+ lines)
- **`chat/`**: Chat interface, sidebar, message input
- **`ui/`**: shadcn/ui component library
- **`code-block.tsx`**: Syntax highlighting and code display

### 🛠️ **Build & Development Tools**

**Package Management**: pnpm (NOT npm/yarn)
**Code Quality**: Biome 1.9.4 (NOT ESLint + Prettier)  
**Testing**: Playwright for E2E testing
**Deployment**: Vercel with automatic builds
**AI SDK Verification**: `pnpm verify:ai-sdk` command

### 🔧 **Critical Implementation Patterns**

**AI SDK 5 Streaming Pattern**:
```typescript
// app/(chat)/api/chat/route.ts (primary chat endpoint)
const stream = createUIMessageStream();
const result = await streamText({
  model: gateway(modelId),
  experimental_activeTools: ACTIVE_TOOLS, // Unified tool list
  // ... configuration
});

await result.consumeStream(); // MUST call before merge
return result.toUIMessageStream({ sendReasoning: true })
  .pipe(smoothStream({ chunking: 'word' }));
```

**Tool Registration Pattern**:
```typescript
// All tools in single ACTIVE_TOOLS array (no separate reasoning/non-reasoning)
const ACTIVE_TOOLS = [
  createDocumentTool,
  updateDocumentTool,
  searchPapersTool,
  // ... all tools available to both model types
];
```

**Message Structure** (AI SDK 5):
```typescript
// UIMessage with parts array (NOT content string)
interface UIMessage {
  parts: UIMessagePart[]; // TextPart | ToolCallPart | ToolResultPart | DataPart
  role: 'user' | 'assistant';
  id: string;
}
```

## Architecture Decision Records

### ✅ **What Works Well**
- **AI Gateway**: Single API key for all providers, unified interface
- **Streaming First**: All chat routes use streaming architecture
- **Tool Consolidation**: Single tool list serves all models efficiently  
- **Dual Database**: Clean separation of app data vs RAG system
- **Component Memoization**: Hash-based dependencies prevent infinite loops

### ⚠️ **Current Challenges**
- **Context Management**: Large conversations can hit token limits
- **Memory Usage**: Long sessions may accumulate memory
- **Error Handling**: Provider credit exhaustion needs graceful fallbacks
- **Performance**: Citation processing can be computationally expensive

### 🚧 **Technical Debt**
- **Schema Migration**: Maintaining backward compatibility with deprecated tables
- **Bundle Size**: Large dependency footprint from AI SDK and tools
- **Test Coverage**: Limited E2E coverage of AI tool interactions

## Development Workflow

### **Standard Commands**:
```bash
pnpm dev          # Local development (never pnpm build locally)
pnpm lint         # Biome linting (some warnings acceptable)
pnpm format       # Biome formatting (formats 186 files)
pnpm verify:ai-sdk # Verify AI SDK v5 compliance
pnpm test         # Playwright E2E tests
```

### **Environment Setup**:
```bash
# Required environment variables
AI_GATEWAY_API_KEY=           # Single key for all AI providers
POSTGRES_URL=                 # Application database
NEXT_PUBLIC_SUPABASE_URL=     # RAG system
NEXT_PUBLIC_SUPABASE_ANON_KEY=
AUTH_SECRET=                  # Supabase Auth configuration (JWT secret)
```

## Context Focus: $ARGUMENTS

For the specified area, here are the key patterns and considerations:

### AI Focus
- Study `lib/ai/` directory structure and patterns
- Understand AI SDK 5 streaming and tool architecture  
- Review existing tools for implementation patterns
- Focus on `route.ts` for chat endpoint logic

### Database Focus  
- Examine dual database architecture rationale
- Study Drizzle schema definitions and relationships
- Understand RAG system independence and integration
- Review migration patterns and backward compatibility

### Frontend Focus
- Analyze App Router structure and layout patterns
- Study complex components like `message.tsx`
- Understand state management and React patterns
- Review UI component integration and styling

### Tools Focus
- Examine existing tool implementations in `lib/ai/tools/`
- Understand tool registration and execution patterns
- Study progress reporting and error handling
- Review UI integration for tool results

This architecture represents a production-grade AI chat application with sophisticated streaming, dual database systems, and comprehensive tool integration. The codebase prioritizes performance, user experience, and maintainable patterns while leveraging cutting-edge AI capabilities.

Ready to work with: **$ARGUMENTS**
