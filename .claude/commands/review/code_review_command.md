---
description: "Perform comprehensive code review with AI SDK 5 and Next.js 15 focus"
argument-hint: "[file/component/feature name]"
allowed-tools: Read(*), Bash(git log --oneline -10), Bash(git diff HEAD~1)
---

# Expert Code Review: $ARGUMENTS

## Review Context
- **Recent Changes**: !`git log --oneline -10`
- **Current Diff**: !`git diff HEAD~1`

## Comprehensive Analysis Framework

Perform a thorough code review focusing on:

### 1. AI SDK 5 Compliance ⚡
- ✅ **Breaking Changes**: Verify `ModelMessage` vs `CoreMessage`, `inputSchema` vs `parameters`
- ✅ **Streaming Patterns**: Confirm `createUIMessageStream` + `result.consumeStream()` usage
- ✅ **Token Limits**: Check `maxOutputTokens` instead of deprecated `maxTokens`
- ✅ **Provider Integration**: Validate `gateway('<vendor>/<id>')` pattern usage
- ✅ **Tool Structure**: Ensure Zod `inputSchema` and proper `execute` functions

### 2. Next.js 15 & React 19 Patterns 🔧
- ✅ **App Router**: Verify proper route structure and layout usage
- ✅ **Server Components**: Check RSC vs Client Component boundaries
- ✅ **Hooks & State**: Validate React 19 patterns, dependency arrays
- ✅ **Error Boundaries**: Confirm proper error handling and recovery

### 3. Database & Supabase Integration 🗄️
- ✅ **Schema Usage**: Verify `Message_v2`, `Document`, current table usage
- ✅ **RAG Operations**: Check vector search and embedding patterns
- ✅ **Query Optimization**: Review Drizzle ORM usage and performance
- ✅ **Auth Integration**: Validate Supabase Auth patterns (NextAuth is removed)

### 4. Performance & Security 🚀
- ✅ **Memory Management**: Check for memory leaks, proper cleanup
- ✅ **Token Efficiency**: Analyze context management and streaming
- ✅ **Error Handling**: Verify graceful degradation and user experience
- ✅ **Security**: Review authentication, authorization, data validation

### 5. Code Quality & Maintainability 📝
- ✅ **TypeScript**: Strong typing, proper interfaces, error types
- ✅ **Testing**: Coverage, edge cases, integration patterns
- ✅ **Documentation**: Clear comments, JSDoc, README updates
- ✅ **Architecture**: Separation of concerns, modularity, scalability

## Action Items Format

For each issue found:
```
🔥 CRITICAL | 🚨 HIGH | ⚠️  MEDIUM | 💡 SUGGESTION

**Issue**: [Clear description]
**Location**: [File:Line]
**Impact**: [Performance/Security/Maintainability]
**Fix**: [Specific implementation guidance]
```

## Specific Focus Areas
Pay special attention to:
- AI tool registration and streaming patterns
- Message part handling and UI updates
- Context management and memory optimization
- Error boundary implementation
- Provider fallback and credit exhaustion handling

Begin the review now for: **$ARGUMENTS**
