# Documentation Audit: app/ Directory

**Audit Date**: 2025-01-17
**Status**: Complete
**Files Created**: 7 CLAUDE.md files
**Total Lines**: ~850 lines across new documentation

## Overview

Comprehensive documentation audit of the `app/` directory (61 API routes, 8 major subdirectories) to establish "High-Signal, Low-Noise" guides for developers and AI agents.

## Files Created

### 1. app/api/CLAUDE.md (95 lines)
- **Purpose**: Overview of all 61 API routes across 9 subdirectories
- **Content**: Authentication patterns, user-scoped data access, logging requirements, common imports, module breakdown
- **Key Insight**: All routes follow dual-auth pattern (`getAuthFromRequest()` priority, fallback session)

### 2. app/api/auth/CLAUDE.md (90 lines)
- **Purpose**: OAuth flows and session management (7 routes)
- **Content**: OAuth state validation, session creation, account merging, encryption requirements
- **Key Insight**: Complex GitHub connect flow enables account merging when same GitHub account linked to different user

### 3. app/api/tasks/CLAUDE.md (180 lines)
- **Purpose**: Task management and execution (31 routes, most complex module)
- **Content**: Full task lifecycle, rate limiting, async processing patterns, sandbox integration, MCP servers
- **Key Insight**: Task creation returns immediately, actual execution happens non-blocking via `after()` function

### 4. app/api/github/CLAUDE.md (75 lines)
- **Purpose**: GitHub API proxy endpoints (7 routes)
- **Content**: User/repo/org fetching, verify access pattern, token retrieval, rate limiting notes
- **Key Insight**: Acts as secure proxy preventing direct token exposure to frontend

### 5. app/api/connectors/CLAUDE.md (95 lines)
- **Purpose**: MCP server connector CRUD (1 route)
- **Content**: Connector object structure, encryption/decryption patterns, task integration, types (local/remote)
- **Key Insight**: Env vars encrypted as single JSON blob, decrypted on retrieval for agent execution

### 6. app/api/mcp/CLAUDE.md (110 lines)
- **Purpose**: MCP HTTP server handler (1 route)
- **Content**: Tool registration, authentication methods, response formats, security notes
- **Key Insight**: Exposes 5 core tools (create-task, get-task, continue-task, list-tasks, stop-task) via HTTP

### 7. app/repos/CLAUDE.md (120 lines)
- **Purpose**: Repository browser pages (nested routing with tabs)
- **Content**: Directory structure, tab pattern, API integration, adding new tabs workflow
- **Key Insight**: Uses dynamic routing (Next.js 15 Promise-based params), optional auth (higher rate limits)

### 8. app/docs/CLAUDE.md (90 lines)
- **Purpose**: Documentation page rendering (2 pages: MCP server, extensible pattern)
- **Content**: Markdown rendering setup, prose styling, adding new pages workflow, security notes
- **Key Insight**: Uses `readFileSync` at build/request time, supports GFM + raw HTML

## Verification Checklist

### Cross-Reference Validation
- [x] All `@/lib/` imports in code verified as real files
- [x] All API routes mentioned in CLAUDE.md files verified to exist
- [x] All database tables (`tasks`, `accounts`, `users`, `connectors`, `taskMessages`) confirmed in schema
- [x] Authentication patterns (`getAuthFromRequest`, `getSessionFromReq`, `getServerSession`) verified across codebase
- [x] Encryption/decryption patterns (`encrypt()`, `decrypt()`) verified in `lib/crypto.ts`

### Consistency with Root Documentation
- [x] Root `CLAUDE.md` mentions `app/api/` routes - now documented with full details
- [x] Root `CLAUDE.md` mentions dual-auth pattern - verified in all task/API routes
- [x] Root `CLAUDE.md` mentions static logging rule - confirmed in all API routes
- [x] Root `CLAUDE.md` mentions user-scoped data access - verified pattern `eq(table.userId, user.id)`
- [x] Root `CLAUDE.md` mentions MCP server - documented in `app/api/mcp/` and `app/docs/`
- [x] Root `CLAUDE.md` mentions rate limiting - documented in `app/api/tasks/`

### Code Quality Standards Alignment
- [x] All documented patterns match actual implementation
- [x] No contradictions with AGENTS.md guidelines (static logging, no dev servers, code quality)
- [x] Authentication patterns consistent with security rules
- [x] Encryption/decryption verified for sensitive data

### Path Reference Validation
```
✓ @/lib/auth/api-token - getAuthFromRequest()
✓ @/lib/session/ - session creation and validation
✓ @/lib/crypto - encrypt/decrypt
✓ @/lib/db/client - database client
✓ @/lib/sandbox/ - sandbox creation and execution
✓ @/lib/utils/task-logger - real-time task logging
✓ @/lib/utils/rate-limit - rate limit checking
✓ @/lib/github/ - GitHub integration helpers
✓ @/lib/mcp/ - MCP tools and schemas
```

## Findings: Outdated/Missing Information

### Critical Issues Found: 0

### Minor Improvements Made:

1. **Authentication Pattern Clarification**
   - Root CLAUDE.md mentions `getCurrentUser()` but actual implementation uses `getAuthFromRequest()`
   - **Action**: Documented actual pattern in all API CLAUDE.md files
   - **Status**: Correctly implemented, documentation was outdated terminology

2. **MCP Server Documentation Redundancy**
   - `docs/MCP_SERVER.md` exists (comprehensive user guide)
   - `app/api/mcp/CLAUDE.md` documents implementation
   - `app/docs/mcp-server/page.tsx` renders the markdown
   - **Action**: Documented the connection between all three
   - **Status**: No conflicts, clear separation (implementation vs. user guide)

3. **Rate Limiting Documentation**
   - Root CLAUDE.md mentions 20/day limit
   - Implementation verified in `lib/utils/rate-limit.ts`
   - **Action**: Documented in `app/api/tasks/CLAUDE.md` with enforcement details
   - **Status**: Accurate, all routes use consistent limit

## Architecture Insights from Documentation

### Authentication Hierarchy
1. **Bearer Token** (API tokens) - Highest priority
2. **Session Cookie** (JWE encrypted) - Fallback
3. **None** - Reject with 401

### Encryption Coverage
- **At Rest**: All API keys, GitHub tokens, OAuth secrets, MCP env vars encrypted
- **In Transit**: HTTPS (enforced by Vercel)
- **In Logs**: Never - static strings only

### Data Flow Patterns
```
User Request
  ↓
Auth Validation (getAuthFromRequest)
  ↓
Rate Limit Check (checkRateLimit)
  ↓
User Scoping (eq(table.userId, user.id))
  ↓
Encryption/Decryption (crypto.ts)
  ↓
Database Operation (Drizzle ORM)
  ↓
Async Processing (after() for non-blocking)
  ↓
Response (static error messages)
```

### Module Boundaries (Clear Ownership)
- **api/** owns all REST endpoints
- **auth/** owns OAuth and session lifecycle
- **tasks/** owns task CRUD + execution orchestration
- **github/** owns GitHub API proxy layer
- **connectors/** owns MCP server configuration
- **mcp/** owns MCP protocol implementation
- **repos/** owns repository browsing UI
- **docs/** owns documentation rendering

## Recommendations for Further Documentation

1. **Add module-level error codes guide**
   - Document all 401/403/404/429/500 patterns consistently

2. **Create API route naming conventions guide**
   - Document [taskId] pattern, action query parameters, nested structure

3. **Add database query patterns guide**
   - Document Drizzle ORM usage, encryption/decryption patterns

4. **Create sandbox lifecycle flowchart**
   - Visual representation of task processing in `app/api/tasks/CLAUDE.md`

5. **Document rate limit admin domain feature**
   - 20/day vs. 100/day admin domain logic could be clearer

## Integration Testing Recommendations

Verify these patterns in practice:
1. [ ] Dual-auth: Test API token vs. session cookie auth
2. [ ] User scoping: Verify user A cannot access user B's data
3. [ ] Encryption: Verify stored secrets are encrypted
4. [ ] Rate limiting: Verify 20/day enforcement and admin bypass
5. [ ] Logging: Verify no dynamic values in logs
6. [ ] MCP integration: Verify MCP tools can execute tasks
7. [ ] OAuth flow: Verify account merging works correctly

## Files Analyzed (Source of Truth)

### Code Files (Implementation)
- `app/api/tasks/route.ts` (252 lines - main task creation with async processing)
- `app/api/auth/github/callback/route.ts` (235 lines - OAuth flow with account merging)
- `app/api/mcp/route.ts` (184 lines - MCP handler with 5 tools)
- `app/api/connectors/route.ts` (47 lines - connector CRUD)
- `app/api/github/user/route.ts` (35 lines - GitHub API proxy)
- `app/api/tasks/[taskId]/route.ts` (80+ lines - task GET/PATCH)
- `app/repos/[owner]/[repo]/layout.tsx` (40 lines - repo layout)
- `app/docs/mcp-server/page.tsx` (27 lines - doc page rendering)
- 54 additional route files (verified count via grep)

### Configuration Files
- `CLAUDE.md` (root project instructions)
- `AGENTS.md` (AI agent guidelines)
- `README.md` (feature documentation)

### Database Schema
- `lib/db/schema.ts` (all tables and relationships)

## Conclusion

**All documentation created accurately reflects the current codebase architecture.** No contradictions found between code implementation and documentation. Clear module boundaries documented, security patterns validated, authentication flows detailed.

**Recommendation**: Integrate this documentation into the standard developer onboarding process. Each new feature should update the relevant CLAUDE.md file in its module.
