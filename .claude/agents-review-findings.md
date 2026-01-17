# Agent Directory Review - Findings & Recommendations

**Date:** 2026-01-17
**Reviewer:** docs-maintainer agent
**Status:** COMPREHENSIVE REVIEW COMPLETE

---

## Executive Summary

The `.claude/agents/` directory contains 15 high-quality agent definitions, most of which are production-ready and codebase-specific. However, there are **4 critical issues** requiring immediate attention:

1. **Cross-Project Contamination** - 3 agents reference the "Orbis" project (different application)
2. **Generic Agents** - 3 agents lack codebase-specific guidance
3. **Technology Stack Drift** - Documentation had outdated Next.js 16 references
4. **Agent Format Inconsistencies** - Varying quality and completeness across agents

---

## Detailed Findings

### 1. Cross-Project Contamination (CRITICAL)

Three agents appear partially copied from the "Orbis" project, a different AI application:

#### security-expert.md (Lines 1-96)
**Orbis-Specific References Found:**
- Line 40: "This Next.js 16 + Supabase application has multiple attack surfaces:"
- Line 43: "Chat Streaming: AI responses with user-generated content (XSS risk in markdown rendering via Streamdown)"
- Line 44: "Artifacts: Generated code/documents (code injection risk)"
- Line 45: "File Uploads: User files via Supabase Storage (malicious file uploads, MIME type spoofing)"
- Line 46: "Guest Users: UUID-based authentication (session hijacking risk, enumerable IDs)"
- Line 47: "AI Tools: External API calls (SSRF, API key exposure, tool-use injection)"
- Line 48: "Database: Dual DB architecture (App DB + Vector DB) with RLS policies"
- Line 95: "_Refined for Orbis architecture (Next.js 16, Supabase, Drizzle, Streamdown) - Dec 2025_"

**Why This Is Wrong:** The AA Coding Agent platform doesn't have:
- Chat streaming (it has task execution with agent output)
- Artifacts/code generation UI
- User file uploads via Supabase Storage
- Guest user authentication
- Dual database architecture with Vector DB/pgvector
- AI tool-use patterns in the same sense

**Impact:** Agent guidance is misaligned with actual codebase concerns.

#### supabase-expert.md (Lines 1-75)
**Orbis-Specific References Found:**
- Line 34: "**Critical Project Architecture:** ... **Vector DB** (`lib/supabase/`): Academic papers, embeddings, hybrid search via Supabase + pgvector"
- Line 11: "Understand the **DUAL DATABASE** architecture: App DB (Drizzle) and Vector DB (Supabase) - NEVER mix them"
- Line 29: "**Database Migrations**: Safe idempotent patterns for both Drizzle (App DB) and Supabase SQL (Vector DB)"

**Why This Is Wrong:** The AA Coding Agent has:
- Single database (PostgreSQL + Drizzle ORM)
- No Vector DB, no pgvector, no embeddings
- No "academic papers" concept

**Impact:** Agent guidance introduces complexity that doesn't exist in this codebase.

#### shadcn-ui-expert.md (Lines 1-59)
**Orbis-Specific References Found:**
- Line 11: "You are a Senior Component Engineer specializing in shadcn/ui primitives, Radix UI composition, and Tailwind CSS v4 styling for the Orbis platform."
- Line 19: "Ensuring zero code duplication by leveraging the **Unified Tool Display system** (`components/tools/*`)."
- Line 29: "Mobile-optimized touch targets" with specific mention of "iPhone 15 Pro viewport (**393×680px**)"

**Why This Is Wrong:** The AA Coding Agent:
- Has no unified tool display system in `components/tools/`
- Doesn't target specific iPhone viewport metrics
- Focuses on task execution UI, not multi-tool orchestration

**Impact:** Agent references non-existent code patterns and viewport constraints.

---

### 2. Generic Agents Lacking Codebase Specificity (HIGH)

#### senior-code-reviewer.md (66 lines)
**Assessment:** Completely generic, could apply to any Next.js project

**Issues:**
- No references to specific files or patterns in codebase
- No mention of static-string logging (critical requirement)
- No reference to security-logging-enforcer dependencies
- No mention of Vercel Sandbox or AI agent patterns
- No reference to MCP server implementation

**Fix Needed:** Add codebase-specific context on:
- Static-string logging enforcement patterns
- Vercel Sandbox orchestration code patterns
- API token encryption patterns
- MCP server integration patterns

#### ui-engineer.md (59 lines)
**Assessment:** Completely generic, offers no codebase-specific guidance

**Issues:**
- No mention of shadcn/ui
- No reference to Tailwind CSS v4
- No mention of static styling patterns
- No integration with react-component-builder
- No mention of WCAG AA compliance as requirement

**Fix Needed:** Either:
- Delete in favor of `react-component-builder` (which covers this domain)
- Or specialize it for "component system architecture" work

#### agent-expert.md (31 lines)
**Assessment:** Meta-focused, unclear trigger conditions

**Issues:**
- "Create and optimize specialized Claude Code agents" - too meta
- References `claude-code-templates` system (not used in this repo)
- No clear when-to-use guidance
- Overlaps with `docs-maintainer` for agent documentation

**Fix Needed:** Clarify scope:
- Is this for creating new agents in `.claude/agents/`?
- Or for designing AI agent architectures in the platform?
- Currently ambiguous and underspecified

---

### 3. Technology Stack Drift (MEDIUM)

**Root CLAUDE.md Status:**
- Line 7: "built with Next.js 15" - **FIXED** ✓
- Line 12: Technology Stack - **FIXED** ✓
- Line 200: api-route-architect still referenced "Next.js 15" - **FIXED** ✓

**Package.json Truth:**
- Next.js 16.0.10
- React 19.2.1
- Tailwind CSS v4.1.13
- Streamdown 1.6.8
- Drizzle ORM 0.36.4

**Remaining Drift in Agents:**
- `react-expert.md` references Cursor rules (local IDE agent), not Claude Code patterns
- `shadcn-ui-expert.md` mentions new-york-v4 variant (valid but not in root CLAUDE.md)

---

### 4. Format Inconsistencies (LOW)

**Excellent Format (Clear YAML frontmatter + comprehensive sections):**
- api-route-architect.md ✓
- database-schema-optimizer.md ✓
- security-logging-enforcer.md ✓
- sandbox-agent-manager.md ✓
- react-component-builder.md ✓
- docs-maintainer.md ✓

**Good Format (Minimal frontmatter, focused sections):**
- react-expert.md ✓
- research-search-expert.md ✓
- security-expert.md ✓
- supabase-expert.md ✓
- shadcn-ui-expert.md ✓
- tailwind-expert.md ✓

**Weak Format (Missing sections or unclear structure):**
- agent-expert.md (too brief, unclear scope)
- senior-code-reviewer.md (generic template, no codebase examples)
- ui-engineer.md (generic template, no codebase examples)

---

## Recommendations (Priority Order)

### IMMEDIATE (Blocking Production Use)

**1. Remove or Rewrite security-expert.md**
- **Action:** Either delete or completely rewrite to focus on AA Coding Agent security
- **Focus Should Be:** Vercel Sandbox security, API token handling, MCP server security
- **Remove:** All Orbis references (chat streaming, artifacts, guest users, Vector DB, RLS policies on chat tables)
- **Add:** Vercel credentials redaction, task execution output sanitization, MCP server validation

**2. Rewrite supabase-expert.md**
- **Action:** Remove all Vector DB / pgvector / dual database references
- **Focus Should Be:** PostgreSQL + Drizzle ORM for user/task/connector management
- **Update Schema References:** users, tasks, connectors, keys, apiTokens, taskMessages, accounts, settings
- **Remove:** Vector DB, pgvector, embedding patterns, academic paper concepts

**3. Rewrite shadcn-ui-expert.md**
- **Action:** Remove Orbis platform references and iPhone viewport metrics
- **Focus Should Be:** shadcn/ui component usage for task execution UI
- **Update Patterns:** Task form, result display, modal dialogs, data tables for tasks/connectors
- **Remove:** "Orbis platform", "393×680px", "Unified Tool Display system", chat-specific patterns

### HIGH PRIORITY (Improves Usability)

**4. Enhance senior-code-reviewer.md**
- Add codebase-specific patterns (static logging, encryption, Vercel Sandbox patterns)
- Reference actual files as examples
- Add checklist for common issues in this codebase

**5. Specialize ui-engineer.md**
- Either delete (overlaps with react-component-builder)
- Or refocus on "design system architecture" or "component composition patterns"

**6. Clarify agent-expert.md**
- Define exact scope: Is this for creating new agents in `.claude/agents/`?
- Add clear trigger conditions
- Provide template or example if for creating new agents

### MEDIUM PRIORITY (Documentation Consistency)

**7. Update react-expert.md references**
- References `.cursor/rules/` (Cursor IDE agent)
- Add equivalent `.claude/` documentation references for cloud execution

**8. Add cross-references between related agents**
- security-expert, security-logging-enforcer, senior-code-reviewer should reference each other
- ui-engineer, react-component-builder, shadcn-ui-expert should have clear delegation boundaries

---

## Agent Delegation Boundaries (For Clarity)

| Agent | Primary Domain | Works With | Does NOT Cover |
|-------|--------|-----------|-----------------|
| **api-route-architect** | API route creation | database-schema-optimizer, security-logging-enforcer | Frontend UI, database design |
| **database-schema-optimizer** | Schema design & migrations | api-route-architect, security-logging-enforcer | Frontend, API contracts |
| **security-logging-enforcer** | Logging compliance & encryption | api-route-architect, database-schema-optimizer, security-expert | Threat modeling, RLS policies |
| **security-expert** | Threat modeling & vulnerability assessment | security-logging-enforcer, supabase-expert | Logging compliance (defer to security-logging-enforcer) |
| **sandbox-agent-manager** | Agent lifecycle & orchestration | api-route-architect (for integration) | Frontend implementation |
| **react-component-builder** | Component creation | react-expert, shadcn-ui-expert, tailwind-expert | Complex page layouts |
| **react-expert** | React patterns & hooks | react-component-builder, shadcn-ui-expert | Component library choice |
| **shadcn-ui-expert** | shadcn/ui implementation | react-component-builder, tailwind-expert | Component architecture |
| **tailwind-expert** | Tailwind CSS patterns | shadcn-ui-expert, react-expert | Component structure |
| **supabase-expert** | Database infrastructure | database-schema-optimizer, security-expert | API layer, ORM patterns |
| **research-search-expert** | Codebase analysis & documentation | (all agents for context validation) | Implementation work |
| **docs-maintainer** | Documentation accuracy | (all agents for doc context) | Code implementation |
| **agent-expert** | Agent architecture design | (meta - applies to agent creation) | Implementation |
| **senior-code-reviewer** | Code quality review | (all agents after implementation) | Specialized domain work |
| **ui-engineer** | **DEPRECATED** - Use react-component-builder instead | react-component-builder | Everything |

---

## Files Modified in This Review

| File | Changes | Status |
|------|---------|--------|
| CLAUDE.md (Line 7) | "Next.js 15" → "Next.js 16" | ✓ Fixed |
| CLAUDE.md (Line 12) | Tech stack updated, added Tailwind v4, Streamdown, MCP | ✓ Fixed |
| CLAUDE.md (Line 200) | "Next.js 15" → "Next.js 16" in api-route-architect description | ✓ Fixed |
| security-expert.md | **REQUIRES REWRITE** - Remove Orbis references | Pending |
| supabase-expert.md | **REQUIRES REWRITE** - Remove Vector DB references | Pending |
| shadcn-ui-expert.md | **REQUIRES REWRITE** - Remove Orbis platform references | Pending |
| senior-code-reviewer.md | **ENHANCEMENT NEEDED** - Add codebase-specific patterns | Pending |
| ui-engineer.md | **DECISION NEEDED** - Delete or specialize | Pending |
| agent-expert.md | **CLARIFICATION NEEDED** - Scope definition | Pending |

---

## Verification Checklist

- [x] All 15 agent files reviewed for accuracy
- [x] Technology stack verified against package.json
- [x] Cross-project contamination identified
- [x] Agent format consistency assessed
- [x] Delegation boundaries documented
- [x] Root CLAUDE.md updated with tech stack fixes
- [ ] security-expert.md rewritten (blocked - awaiting approval)
- [ ] supabase-expert.md rewritten (blocked - awaiting approval)
- [ ] shadcn-ui-expert.md rewritten (blocked - awaiting approval)
- [ ] senior-code-reviewer.md enhanced (blocked - awaiting approval)
- [ ] ui-engineer.md decision made (blocked - awaiting decision)
- [ ] agent-expert.md clarified (blocked - awaiting clarification)

---

## Next Steps

1. **Review this report** and approve remediation plan
2. **Rewrite problematic agents** (security-expert, supabase-expert, shadcn-ui-expert)
3. **Enhance generic agents** (senior-code-reviewer, ui-engineer, agent-expert)
4. **Validate updated agents** against actual codebase patterns
5. **Update root CLAUDE.md section** if any agent scope changes
6. **Document agent evolution** in version control
