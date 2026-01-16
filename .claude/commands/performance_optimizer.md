---
description: "Analyze and optimize performance for AI chat application"
argument-hint: "[focus area: streaming|memory|database|ui|tokens]"
allowed-tools: Read(*), Bash(pnpm build --dry-run), Bash(du -sh node_modules), Bash(grep -r "useState\|useEffect" components/)
---

# ⚡ Performance Optimization: $ARGUMENTS

## Performance Health Check
- **Build Analysis**: !`pnpm build --dry-run`
- **Bundle Size**: !`du -sh node_modules`
- **React Hooks Usage**: !`grep -r "useState\|useEffect" components/ | wc -l`

## Comprehensive Performance Framework

### 1. Streaming & Real-Time Performance 🌊

**AI Streaming Optimization**:
```typescript
// Current patterns to verify:
// - app/(chat)/api/chat/route.ts streaming implementation
// - smoothStream({ chunking: 'word' }) usage
// - Keep-alive pulses during long operations

// Optimization checklist:
// ✅ result.consumeStream() called before merging
// ✅ Proper abort handling for cancelled requests  
// ✅ Token-efficient context management
// ✅ Progressive response rendering
```

**Critical Performance Patterns**:
- **Stream Consumption**: Must call `result.consumeStream()` before UI merge
- **Progress Pulses**: Periodic "Thinking..." updates prevent timeout
- **Chunked Delivery**: Word-level streaming for better UX
- **Error Recovery**: Graceful handling of provider failures

### 2. Memory Management & React Optimization 🧠

**Memory Leak Prevention**:
```typescript
// Check components/message.tsx for:
// - RegisterCitations hash-based dependencies (lines 42-72)
// - Proper React.memo usage with fast-deep-equal
// - Cleanup of event listeners and subscriptions

// React 19 RC optimization patterns:
// ✅ Proper dependency arrays in useEffect
// ✅ useMemo for expensive calculations
// ✅ useCallback for event handlers
// ✅ Component memoization with equality checks
```

**Hook Optimization Audit**:
```bash
# Find potential performance issues
grep -r "useEffect(\[\])" components/ # Missing dependencies
grep -r "useState.*{}" components/   # Complex initial state
grep -r "new.*\[\]" components/      # Object creation in render
```

### 3. Database & Query Performance 🗄️

**Application Database Optimization**:
```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM "Message_v2" WHERE chat_id = $1 ORDER BY created_at DESC;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;

-- Identify slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;
```

**RAG System Performance**:
```sql
-- Vector search optimization
EXPLAIN ANALYZE 
SELECT * FROM hybrid_search_papers_v4('machine learning', 10);

-- Index health check
SELECT * FROM pg_stat_user_indexes 
WHERE tablename = 'academic_documents';

-- Embedding coverage analysis
SELECT COUNT(*) filter (WHERE embedding IS NOT NULL) * 100.0 / COUNT(*) as coverage
FROM academic_documents;
```

### 4. Token & Context Optimization 💰

**Token Efficiency Analysis**:
- **Context Management**: Monitor context window usage
- **Message Compression**: Automatic compaction strategies
- **Provider Selection**: Optimize model choice for task complexity
- **Prompt Engineering**: Reduce token usage in system prompts

**AI Gateway Optimization**:
```typescript
// Verify efficient model routing:
// - lib/ai/providers.ts model mappings
// - Dynamic model discovery for guest users
// - Credit exhaustion fallback handling
// - Provider-specific optimization patterns
```

### 5. UI & Rendering Performance 🎨

**Component Rendering Optimization**:
```typescript
// Audit rendering performance:
// - Large message lists (virtualization needed?)
// - Citation processing (RegisterCitations optimization)
// - Tool result rendering (complex data display)
// - Real-time typing indicators

// React Optimization Checklist:
// ✅ Keys for dynamic lists
// ✅ Conditional rendering optimization  
// ✅ Image lazy loading
// ✅ Code block syntax highlighting efficiency
```

**Bundle Size Optimization**:
```bash
# Analyze bundle composition
npx @next/bundle-analyzer

# Check for unused dependencies
npx depcheck

# Tree-shaking verification
grep -r "import \*" . --exclude-dir=node_modules
```

### 6. Network & API Performance 🌐

**API Route Optimization**:
- **Response Compression**: Gzip/Brotli for large responses
- **Caching Headers**: Appropriate cache-control settings
- **Request Batching**: Combine multiple API calls
- **Error Response Time**: Fast error handling

**External API Integration**:
- **Connection Pooling**: Reuse HTTP connections
- **Timeout Management**: Appropriate timeout values  
- **Retry Strategies**: Exponential backoff patterns
- **Rate Limit Handling**: Graceful degradation

## Performance Analysis Tools

### Profiling Commands
```bash
# Next.js build analysis
pnpm build && pnpm start --profile

# Database query profiling  
psql $POSTGRES_URL -c "SELECT pg_stat_reset();"
# Run application, then:
psql $POSTGRES_URL -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC;"

# Memory usage monitoring
node --inspect --max-old-space-size=4096 node_modules/.bin/next start
```

### Performance Metrics

**Critical Thresholds**:
- **First Response**: < 200ms for initial AI response
- **Streaming Latency**: < 50ms between token chunks  
- **Database Queries**: < 100ms for typical operations
- **Bundle Size**: < 500KB initial JS bundle
- **Memory Usage**: < 100MB steady state per session

## Optimization Focus: $ARGUMENTS

Based on the specified focus area, implement targeted optimizations:

### Streaming Focus
- Audit streaming architecture in route.ts
- Verify proper stream consumption patterns
- Optimize token delivery and chunking
- Test with slow/fast network conditions

### Memory Focus  
- Profile React component re-renders
- Check for memory leaks in long conversations
- Optimize hook dependencies and memoization
- Monitor heap growth patterns

### Database Focus
- Analyze query execution plans  
- Optimize indexes for common operations
- Implement query result caching
- Monitor connection pool efficiency

### UI Focus
- Audit component rendering performance
- Implement virtualization for large lists
- Optimize image and media loading
- Reduce layout thrashing

### Token Focus
- Minimize context window usage
- Optimize prompt engineering
- Implement smart context compression
- Monitor API cost efficiency

Begin performance analysis and optimization for: **$ARGUMENTS**

Focus on measurable improvements with specific metrics and before/after comparisons.
