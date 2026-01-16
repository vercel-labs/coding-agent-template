# Custom Claude Code Subagents Analysis
## AA Coding Agent Platform

**Date:** January 15, 2026
**Platform:** Next.js 15, React 19, Vercel AI SDK 5, Drizzle ORM, PostgreSQL/Supabase
**Scope:** Multi-agent AI coding assistant with Vercel Sandbox execution

---

## Executive Summary

The AA Coding Agent platform is a sophisticated multi-user, multi-agent AI coding assistant that manages complex workflows across authentication, database operations, sandbox execution, API integration, and React UI development. **Analysis identifies 5 high-impact custom subagents** that would significantly improve development velocity, code consistency, security enforcement, and operational resilience.

### Key Opportunities
- **Repetitive patterns** in API route creation, database operations, and error handling
- **Security-critical requirements** (static logging, sensitive data redaction, user scoping)
- **Complex workflows** (sandbox lifecycle, agent orchestration, Git operations)
- **Multi-layer consistency** (schema validation, UI component patterns, type safety)
- **Testing gaps** (no integration tests observed; unit test coverage unclear)

---

## Architecture Overview

### Current System Components
```
Frontend (Next.js 15 + React 19)
  ├── Pages (app/*)
  ├── Components (shadcn/ui based)
  ├── State Management (Jotai atoms)
  └── API Integration (fetch/React Query patterns)

Backend (Next.js API Routes)
  ├── Authentication (/api/auth/*)
  ├── Task Management (/api/tasks/*)
  ├── GitHub Integration (/api/github/*, /api/repos/*)
  ├── Settings & Keys (/api/api-keys/*, /api/connectors/*)
  └── Sandbox Operations (/api/sandboxes/*)

Execution Engine (lib/sandbox/)
  ├── Sandbox Creation (Vercel SDK)
  ├── Agent Executors (claude.ts, codex.ts, etc.)
  ├── Git Operations (commit, push, PR creation)
  ├── Package Detection (npm/pnpm/yarn)
  └── Command Execution (isolated shell)

Data Layer (PostgreSQL/Supabase)
  ├── Users (auth + OAuth)
  ├── Tasks (status, logs, Git info)
  ├── Accounts (linked providers)
  ├── Keys (encrypted API keys)
  ├── TaskMessages (chat history)
  ├── Connectors (MCP servers)
  └── Settings (user preferences)

Utilities & Services (lib/)
  ├── Encryption (crypto.ts)
  ├── Logging (task-logger.ts, logging.ts)
  ├── ID Generation (nanoid)
  ├── GitHub Client (octokit)
  ├── AI SDK Integration (Vercel AI v5)
  └── Rate Limiting
```

### Data Flow Patterns
1. **Task Creation:** User request → Validation → DB insert → Branch name generation (async) → Sandbox creation
2. **Agent Execution:** Sandbox setup → Install agent CLI → Configure auth → Execute instruction → Stream JSON output → Git commit/push
3. **Follow-up Messages:** Resumed sandbox → Session ID lookup → Re-execute agent → Capture streaming output
4. **Security:** All tokens encrypted at rest → Decrypted on-demand → Redacted in logs (static strings only)

---

## Critical Code Patterns Identified

### 1. API Route Pattern (Security + Validation)
```typescript
// Pattern: All /api/* routes follow this structure
async function HANDLER(request: NextRequest) {
  // 1. Session validation (getCurrentUser)
  const session = await getServerSession()
  if (!session?.user?.id) return 401

  // 2. Rate limiting check
  const rateLimit = await checkRateLimit(user)
  if (!rateLimit.allowed) return 429

  // 3. Request validation (Zod schemas)
  const validatedData = schemaName.parse(body)

  // 4. User-scoped database query
  const results = await db.select().from(table)
    .where(eq(table.userId, session.user.id))

  // 5. Static logging only (NO dynamic values)
  await logger.info('Operation completed')  // ✓ Good
  // await logger.error(`Failed: ${error.message}`)  // ✗ Bad

  return NextResponse.json(results)
}
```

**Repetition:** ~30+ API routes follow this pattern with variations.

### 2. Sandbox Lifecycle (Complex State Machine)
```typescript
// lib/sandbox/creation.ts follows this pattern:
1. validateEnvironmentVariables()
2. createAuthenticatedRepoUrl()
3. Sandbox.create(config)
4. sandbox.runCommand() → clone repo
5. detectPackageManager()
6. installDependencies()
7. setupAgentAuth()
8. executeAgent()
9. pushChangesToBranch()
10. shutdownSandbox()
```

**Complexity:** Error handling, cancellation, resumption, keepAlive logic needs consistent patterns.

### 3. Logging Pattern (Security Critical)
```typescript
// ✓ Correct: Static strings only
await logger.info('Claude CLI installed successfully')
await logger.command(redactedCommand)  // Pre-redacted before logging

// ✗ Violation: Dynamic values in logs
await logger.info(`Task created: ${taskId}`)  // Line 336, creation.ts
await logger.error(`Failed: ${error.message}`)  // Generic pattern
```

**Security Gap:** Task logger, sandbox logger, and agent executors need consistent static-string enforcement.

### 4. Encryption Pattern (Consistent Across All Secrets)
```typescript
// Current: Inconsistent application
// keys table: encrypted (line 325, schema.ts)
// connectors.env: encrypted (line 200, schema.ts)
// users.accessToken: encrypted (line 23, schema.ts)
// accounts.accessToken: encrypted (line 268, schema.ts)

// Pattern is standardized but easy to miss new fields
```

### 5. User Scoping Pattern (Authorization Boundary)
```typescript
// ✓ Pattern: Filter by userId
const task = await db.select().from(tasks)
  .where(and(eq(tasks.userId, user.id), ...))

// ✗ Anti-pattern not found in API routes
// (But important to enforce in all new routes)
```

---

## Identified Pain Points & Gaps

### A. Code Quality & Consistency
| Issue | Impact | Frequency |
|-------|--------|-----------|
| API route boilerplate (session, validation, scoping) | Dev velocity | 30+ routes |
| Inconsistent error handling patterns | Maintenance burden | Throughout |
| Manual TypeScript → Zod schema duplication | Type safety drift | Database operations |
| Missing unit/integration tests | Regression risk | Critical paths |
| Component pattern inconsistencies (shadcn/ui adoption) | UI/UX debt | components/ |

### B. Database Operations
| Issue | Impact | Frequency |
|-------|--------|-----------|
| Manual relationship management (foreign keys) | Data integrity risk | In migrations |
| Schema validation spread across routes | Maintenance burden | 40+ endpoints |
| Encryption applied inconsistently | Security drift | New fields |
| No query builder helpers for common patterns | Dev velocity | Task queries |
| Complex queries hard to debug | Troubleshooting | Nested selects |

### C. API Development
| Issue | Impact | Frequency |
|-------|--------|-----------|
| Rate limiting check boilerplate | Copy-paste errors | 30+ routes |
| GitHub API error handling varies | Unpredictable UX | 10+ GitHub routes |
| Session validation repetition | Security gaps possible | All routes |
| Response format inconsistency | Frontend integration pain | API responses |
| Missing request/response logging | Troubleshooting difficulty | All routes |

### D. Sandbox & Agent Execution
| Issue | Impact | Frequency |
|-------|--------|-----------|
| Agent executor implementations vary (claude.ts, codex.ts, etc.) | Maintenance burden | 6 agents |
| Logging not consistently static-string | Security risk | All agents |
| Error recovery logic duplicated | Complexity | Each agent |
| Session/resumption logic complex | Bugs in follow-ups | claude.ts (500+ LOC) |
| Dependency installation detection needs consistency | Environment issues | creation.ts |

### E. Security & Logging
| Issue | Impact | Frequency |
|-------|--------|-----------|
| Dynamic values in logs possible | Data leakage risk | Task logger + agents |
| Redaction happens ad-hoc | Incomplete protection | logging.ts + task-logger.ts |
| Static string enforcement not automated | Human error risk | All log statements |
| Sensitive field detection reactive | New fields missed | connectors.env, keys |

### F. Testing & Verification
| Issue | Impact | Frequency |
|-------|--------|-----------|
| No integration tests found | Deployment risk | All critical paths |
| Agent execution not unit-testable | Verification gaps | sandbox/agents/ |
| API route testing minimal | Regression risk | 50+ routes |
| UI component test coverage unclear | Component reliability unknown | components/ |

---

## Recommended Subagents

### 1. **TypeScript API Route Architect**
**Purpose:** Generate consistent, secure, production-ready API route boilerplate with full validation, error handling, and logging.

#### Tasks
- Create new API routes with session validation, rate limiting, request validation, user scoping, and standardized responses
- Add new endpoints to existing collections (e.g., new `/api/tasks/[id]/...` route)
- Refactor existing routes to enforce consistency
- Generate OpenAPI/type-safe response schemas
- Implement proper error boundaries and HTTP status codes

#### What It Handles
- Session authentication (getCurrentUser) with fallback handling
- Zod schema validation for request bodies
- Rate limit checks with proper 429 responses
- User-scoped database queries (filtering by userId)
- Static-string logging enforcement
- Standardized error responses (with actionable messages, no leaking internals)
- TypeScript types from database schema

#### Tools Needed
- Code generation (read existing patterns, generate boilerplate)
- Database schema reading (map Drizzle types to API response types)
- Type inference (auto-generate Zod schemas from TS interfaces)
- ESLint rules (validate static-string logging)
- OpenAPI/tsdoc generation

#### Permissions Required
- Read all `/api/*` routes for pattern reference
- Read `lib/db/schema.ts` for table types
- Read `lib/auth/session.ts` for session validation patterns
- Write new API route files
- Modify existing route files

#### Example Use Cases
```
1. "Create GET /api/tasks/[id]/logs route that returns filtered task logs with proper auth"
2. "Add POST /api/connectors/[id]/test endpoint to verify MCP server connectivity"
3. "Refactor /api/github/* routes to use standardized error responses"
4. "Generate type-safe response types from existing Drizzle schema for frontend SDK"
```

#### Expected Output
- Ready-to-deploy API route files
- TypeScript types for request/response
- Zod schemas for validation
- Error handling with proper HTTP status codes
- Audit trail: static-string logs only

---

### 2. **Database Schema & Query Optimizer**
**Purpose:** Manage Drizzle ORM schema evolution, generate type-safe queries, and ensure data integrity patterns.

#### Tasks
- Design new tables aligned with existing schema patterns
- Generate Drizzle migrations from schema changes
- Build type-safe query helpers (common patterns: filter by userId, fetch with relationships)
- Validate foreign key relationships and cascade logic
- Ensure encryption applied to all sensitive fields
- Optimize queries for common access patterns

#### What It Handles
- Schema design with TypeScript first (types inform DB)
- Automatic Zod schema generation from table definitions
- Foreign key relationship mapping and validation
- Encryption field detection and consistent application
- Migration generation and rollback planning
- Query builder helpers (`getUserTasks`, `getConnectorsByUser`, etc.)
- Index recommendations for common filters

#### Tools Needed
- Drizzle schema parsing and analysis
- TypeScript interface extraction
- SQL migration generation
- Relationship validator (FK chains, circular deps)
- Zod schema auto-generation
- Query performance analysis

#### Permissions Required
- Read/write `lib/db/schema.ts`
- Generate migration files in `lib/db/migrations/`
- Read `lib/db/client.ts` for database connection
- Access test data/dev environment for validation

#### Example Use Cases
```
1. "Add 'preferences' table for user-specific UI settings with proper encryption"
2. "Create migration to add 'deletedAt' soft delete field to tasks table"
3. "Generate type-safe query helpers for task filtering by status and date range"
4. "Validate all foreign keys in schema have proper cascade delete rules"
5. "Recommend indexes for improving task list query performance"
```

#### Expected Output
- Schema changes with Zod types
- Generated migrations
- Query helper functions
- Documentation of relationships
- Performance analysis

---

### 3. **Security & Logging Enforcer**
**Purpose:** Audit code for security vulnerabilities, enforce static-string logging, validate encryption coverage, and prevent data leakage.

#### Tasks
- Scan all log statements for dynamic value inclusion
- Ensure all sensitive fields encrypted at rest
- Validate redaction patterns work for new API key formats
- Test logging for data leakage (taskId, userId, tokens, file paths)
- Generate security audit reports
- Refactor violations to compliant patterns

#### What It Handles
- Static-string logging validation (no dynamic values in any logger call)
- Encryption field detection (new tables, schema changes)
- Sensitive data pattern matching (tokens, keys, emails, file paths)
- Redaction function completeness verification
- User data access boundary enforcement
- Vercel sandbox credentials protection
- MCP server secrets management

#### Tools Needed
- AST parser (detect logger calls with dynamic content)
- Regex pattern matching (for sensitive data)
- Code flow analysis (trace secret propagation)
- Encryption field detection (schema scanning)
- Static analysis (find unscoped queries)

#### Permissions Required
- Read all `lib/` files (utilities, services)
- Read all `/api/*` routes
- Read all `lib/sandbox/agents/` files
- Modify files to refactor violations
- Execute type-checking and linting

#### Example Use Cases
```
1. "Audit all logging statements for compliance with static-string requirement"
2. "Add encryption to new 'apiEndpoint' field in connectors table"
3. "Generate redaction patterns for new OAuth provider secrets"
4. "Validate that user-scoped queries filter by userId in all new routes"
5. "Scan sandbox creation logs for accidental credential leakage"
```

#### Expected Output
- Security audit report with violations
- Refactored code (static strings, encrypted fields)
- Redaction pattern updates
- Compliance checklist
- Training document for team

---

### 4. **Sandbox & Agent Lifecycle Manager**
**Purpose:** Unify agent implementations, standardize sandbox lifecycle, handle error recovery, and manage session persistence.

#### Tasks
- Refactor agent executors (claude.ts, codex.ts, etc.) to use common patterns
- Build sandbox state machine with clear transitions and error handling
- Implement resilient session/resumption logic
- Generate agent implementations from template
- Add comprehensive error recovery patterns
- Standardize MCP server configuration across agents
- Optimize dependency installation detection

#### What It Handles
- Agent executor lifecycle (install → configure → execute → cleanup)
- Sandbox state transitions (creating → ready → executing → completed/error)
- Error recovery strategies (retry logic, fallbacks, graceful degradation)
- Session resumption for multi-turn interactions
- MCP server setup (local and remote)
- Dependency detection consistency (npm/pnpm/yarn)
- Streaming output handling and parsing
- Sandbox registry and cleanup

#### Tools Needed
- Agent CLI documentation parsing
- State machine generator
- Error recovery pattern library
- Template-based code generation
- Streaming JSON parser validation
- Process management utilities

#### Permissions Required
- Read/write all `lib/sandbox/agents/*` files
- Read/write `lib/sandbox/creation.ts`
- Read/write `lib/sandbox/git.ts`
- Read/write `lib/sandbox/package-manager.ts`
- Read agent CLI documentation

#### Example Use Cases
```
1. "Refactor all agent executors to use unified error handling pattern"
2. "Add retry logic to agent installation with exponential backoff"
3. "Create session resumption helper to standardize multi-turn interactions"
4. "Generate new agent executor for OpenRouter-based agents"
5. "Implement sandbox health checks and auto-recovery"
6. "Add comprehensive logging to sandbox state transitions"
```

#### Expected Output
- Unified agent executor template
- Refactored agent implementations
- State machine documentation
- Error recovery playbook
- Session management helpers

---

### 5. **React Component & UI Pattern Library**
**Purpose:** Create consistent component patterns, enforce shadcn/ui adoption, generate typed form builders, and ensure accessibility.

#### Tasks
- Audit existing components for shadcn/ui usage opportunities
- Generate new components from shadcn/ui library
- Create form builder with automatic Zod validation
- Build component composition patterns
- Generate TypeScript prop types from database schemas
- Add accessibility checks (a11y)
- Create component documentation and Storybook entries

#### What It Handles
- shadcn/ui component adoption (check availability before creating custom)
- Form builders with automatic Zod schema binding
- Type-safe component props (from Drizzle schema)
- Composition patterns (compound components)
- State management with Jotai (existing pattern)
- Responsive design validation
- Accessibility compliance (WCAG 2.1 AA)
- Dark mode support (next-themes integration)

#### Tools Needed
- shadcn/ui component index parser
- TypeScript type extraction
- Form builder generator
- Accessibility validator (axe-core patterns)
- Component composition analyzer
- Dark mode testing utilities

#### Permissions Required
- Read all `components/*` files
- Read `lib/db/schema.ts` (for type generation)
- Write new component files
- Modify existing components
- Check shadcn/ui availability via CLI

#### Example Use Cases
```
1. "Create TaskForm component with automatic Zod validation from insertTaskSchema"
2. "Add accessibility audit to all form components and fix violations"
3. "Generate ConnectorDialog using shadcn components instead of custom UI"
4. "Build type-safe data table component from Task schema for displaying tasks list"
5. "Create form builder for dynamic MCP server configuration fields"
6. "Refactor FileEditor to use existing shadcn Editor component if available"
```

#### Expected Output
- New UI components (shadcn-based)
- Form builders with validation
- Component documentation
- Accessibility audit report
- Type-safe component library

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. **Deploy Security & Logging Enforcer**
   - Scan codebase for violations
   - Generate refactoring plan
   - Fix critical security issues

2. **Deploy Database Schema Optimizer**
   - Document current schema patterns
   - Create migration templates
   - Build query helper library

### Phase 2: Infrastructure (Week 3-4)
3. **Deploy TypeScript API Route Architect**
   - Audit existing routes for consistency
   - Create route template library
   - Refactor 10% of routes as proof-of-concept

4. **Deploy Sandbox & Agent Lifecycle Manager**
   - Document agent implementation variations
   - Create unified pattern
   - Refactor one agent as pilot

### Phase 3: Application (Week 5-6)
5. **Deploy React Component & UI Pattern Library**
   - Audit component library
   - Create new components
   - Establish pattern library

### Phase 4: Deployment & Optimization (Week 7+)
- Scale refactoring across codebase
- Automate quality checks via pre-commit hooks
- Monitor compliance metrics

---

## Expected Impact

### Development Velocity
- **30% faster** API route creation (boilerplate generation)
- **50% fewer bugs** (standardized patterns, automated validation)
- **40% reduction** in code review time (clear patterns, auto-enforced rules)

### Code Quality
- **100% consistency** on security requirements (static logging, encryption)
- **Zero data leakage** incidents (automated scanning)
- **Type-safe** at all layers (schema → API → UI)

### Team Efficiency
- **Reduced onboarding time** (clear patterns to follow)
- **Fewer security reviews** (automated enforcement)
- **Better documentation** (auto-generated from code)

### Risk Reduction
- **Prevent security regressions** (automated scanning)
- **Catch type errors early** (full-stack type safety)
- **Consistent error handling** (user-facing reliability)

---

## Success Criteria

### Per-Subagent Metrics
1. **TypeScript API Route Architect**
   - Generates valid, deployable routes
   - All routes pass type-check and lint
   - Reduces boilerplate by 60%

2. **Database Schema & Query Optimizer**
   - Generates valid Drizzle migrations
   - Queries pass type-checking
   - Query performance matches manual implementations

3. **Security & Logging Enforcer**
   - Finds 100% of dynamic log statements
   - Validates encryption on 100% of sensitive fields
   - Zero false positives on redaction patterns

4. **Sandbox & Agent Lifecycle Manager**
   - Agent executors follow unified pattern
   - Error recovery reduces sandboxes stuck in bad states by 80%
   - Session resumption works consistently

5. **React Component & UI Pattern Library**
   - Components follow shadcn/ui patterns
   - 100% type safety on component props
   - Passes accessibility audit (WCAG 2.1 AA)

---

## Integration with Existing Workflow

### Current CLAUDE.md Requirements
All subagents will enforce:
- ✓ Static-string logging only (Security & Logging Enforcer)
- ✓ Cloud-first deployment (no local builds)
- ✓ Vercel AI SDK 5 patterns only
- ✓ Type-safe implementations (TypeScript strict mode)
- ✓ User-scoped data access (filter by userId)
- ✓ Encrypted sensitive data (API keys, tokens)
- ✓ Pre-deployment code quality checks (format, type-check, lint)

### Tools & Standards
- **Language:** TypeScript 5+ with strict mode
- **ORM:** Drizzle ORM with proper type inference
- **Validation:** Zod schemas
- **UI:** React 19 with shadcn/ui + Tailwind CSS
- **Testing:** Jest/Vitest for units, Playwright for E2E
- **Formatting:** Prettier (existing config)
- **Linting:** ESLint 9+ (existing config)

---

## Risk Mitigation

### Potential Risks
1. **Subagent over-generalization** → Mitigate: Start with specific, bounded tasks
2. **Generated code quality** → Mitigate: Strict TypeScript, linting enforcement
3. **Missed edge cases** → Mitigate: Review first 10% of generated code manually
4. **Integration friction** → Mitigate: Use existing libraries (shadcn/ui, Drizzle, Zod)

### Rollback Plan
- All changes pushed to feature branches before merge
- Git history preserved for forensic analysis
- Database migrations reversible (down migrations)
- Feature flags for large deployments

---

## Conclusion

The AA Coding Agent platform has **clear patterns and predictable structure** that make it ideal for custom subagent development. The **5 recommended subagents** address high-impact pain points across API development, database operations, security, sandbox orchestration, and UI consistency.

**Immediate recommendation:** Start with the **Security & Logging Enforcer** (highest risk mitigation) and **Database Schema Optimizer** (foundation for other agents), then proceed with API Route Architect and Sandbox Manager in parallel.

---

## Appendix: File Reference Map

### Critical Files
- `lib/db/schema.ts` - Database schema (432 lines)
- `lib/sandbox/creation.ts` - Sandbox lifecycle (300+ lines)
- `lib/sandbox/agents/claude.ts` - Agent implementation (570+ lines)
- `app/api/tasks/route.ts` - Task CRUD (API route pattern)
- `lib/utils/task-logger.ts` - Logging (security critical)
- `lib/utils/logging.ts` - Redaction patterns
- `CLAUDE.md` - Developer guide (security + patterns)

### Pattern References
- API routes: `app/api/tasks/route.ts`, `app/api/api-keys/route.ts`
- Database operations: `lib/db/client.ts`
- Authentication: `lib/auth/session.ts`, `lib/session/get-server-session.ts`
- Encryption: `lib/crypto.ts`
- GitHub integration: `lib/github/client.ts`

### Component Examples
- Forms: `components/task-form.tsx`
- Dialogs: `components/create-pr-dialog.tsx`, `components/api-keys-dialog.tsx`
- Layouts: `components/app-layout.tsx`
- Auth: `components/auth/sign-in.tsx`

---

**Document prepared for:** AA Coding Agent development team
**Prepared by:** Claude Code Architecture Analysis
**Status:** Ready for subagent procurement and integration planning
