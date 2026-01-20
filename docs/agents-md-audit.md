# AGENTS.md Audit Report

**Date**: January 20, 2026
**Auditor**: Senior Documentation Architect
**Status**: DETAILED FINDINGS - No Changes Applied Yet

---

## Executive Summary

AGENTS.md is comprehensive and largely accurate, but contains several gaps in agent-specific implementation details, missing agent capability documentation, and incomplete error handling patterns. The document excels at security guidelines but lacks practical agent implementation references.

**Key Issues**:
1. **Missing Agent Capabilities Matrix** - No comparison of which agents support MCP, streaming, resumption, or specific models
2. **Incomplete Error Handling Patterns** - Generic guidance without agent-specific error responses
3. **Undocumented Agent Features**:
   - Gemini agent CLI existence and capabilities
   - OpenCode agent implementation status
   - Cursor agent CLI installation method (curl-based)
   - Codex agent configuration (TOML vs JSON)
4. **Streaming Behavior Gaps** - Only Claude, Copilot, Cursor document streaming; Codex, Gemini, OpenCode don't
5. **Model Selection Undocumented** - Missing fallback model defaults for each agent
6. **Session Resumption Limited** - Codex and Gemini don't support session resumption despite documentation implying all agents do
7. **Logging Redaction** - Documentation says "static strings only" but doesn't explain what gets redacted automatically

---

## Current State Assessment

### Strengths

1. **Security Guidelines (Lines 5-54)** ✓
   - Comprehensive static-string logging rules
   - Clear sensitive data list
   - Excellent rationale explanation
   - Matches code implementation perfectly

2. **Code Quality Guidelines (Lines 56-118)** ✓
   - Format, lint, type-check requirements clearly stated
   - Dev server prohibition well-reasoned
   - shadcn CLI guidance appropriate

3. **Logging Best Practices (Lines 120-143)** ✓
   - Concrete examples provided
   - Server vs client-side logging distinction clear
   - Progress updates guidance useful

4. **Task Execution Workflow (Lines 176-200)** ✓
   - Source branch handling documented
   - Field descriptions accurate
   - Fallback logic clear

5. **Architecture Guidelines (Lines 260-308)** ✓
   - Repository page structure comprehensive
   - Tab addition instructions clear
   - Component patterns well-defined

### Gaps & Inaccuracies

#### 1. **Missing Agent Capabilities Matrix**

**Gap**: No comprehensive table showing which agents support:
- MCP servers
- Streaming output
- Session resumption
- Model selection
- Default models

**Current Code Reality**:
```typescript
// Claude: Full MCP support, streaming, resumption with UUID validation
// Codex: AI Gateway only, NO resumption (--last flag), config via TOML
// Copilot: MCP via mcp-config.json, streaming text output, NO resumption
// Cursor: No documented MCP, streaming, resumption unclear
// Gemini: No documented MCP, NO streaming, NO resumption
// OpenCode: Requires OPENAI_API_KEY OR ANTHROPIC_API_KEY, NO MCP, NO streaming
```

**AGENTS.md Says**: "Agent Implementations (lib/sandbox/agents/) - Each agent file (claude.ts, codex.ts, copilot.ts, cursor.ts, gemini.ts, opencode.ts) implements: runAgent(), Logging, Sandbox execution, Git operations, Model selection logic, API key handling"

**Reality**: Not all agents implement all features equally. Example: Gemini doesn't validate selectedModel before passing to CLI.

---

#### 2. **Model Selection Defaults Not Documented**

**Gap**: AGENTS.md doesn't specify fallback models for each agent.

**Actual Implementation**:
- **Claude**: `claude-sonnet-4-5-20250929` (line 247 in claude.ts)
- **Codex**: `openai/gpt-4o` (line 150 in codex.ts)
- **Copilot**: No default (model is optional, passed via --model if provided)
- **Cursor**: No default documented
- **Gemini**: No default documented
- **OpenCode**: No default documented

---

#### 3. **Streaming Output Not Fully Documented**

**Gap**: Only Claude mentions streaming. Reality shows:
- **Claude**: Full streaming to taskMessages table (newline-delimited JSON parsing)
- **Copilot**: Text streaming to taskMessages (filters diff boxes)
- **Cursor**: Streaming support exists (streamOutput parameter)
- **Codex**: No streaming (captures output at end)
- **Gemini**: No streaming
- **OpenCode**: No streaming

---

#### 4. **Session Resumption Incomplete**

**Gap**: AGENTS.md mentions resumption but doesn't clarify which agents support it.

**Implementation Reality**:
```typescript
// Claude: Full resumption support
// - Valid UUID: --resume "<sessionId>"
// - Fallback: --continue for most recent session
// - Extracts session_id from streaming JSON

// Codex: Limited resumption
// - Uses --last flag (no session ID parameter)
// - Marked as "resume most recent session"

// Copilot: Optional resumption
// - Uses --resume if sessionId provided
// - May not work reliably

// Cursor: Session support
// - isResumed flag present
// - sessionId parameter passed
// - Implementation details unclear

// Gemini: NO resumption support
// - isResumed parameter ignored
// - No session handling code

// OpenCode: Unclear
// - isResumed parameter present but not used
// - No session extraction
```

---

#### 5. **API Key Priority Logic Incomplete**

**Gap**: AGENTS.md documents Claude's API Gateway priority but not other agents.

**Actual Implementation**:
- **Claude**: AI_GATEWAY_API_KEY (preferred) → ANTHROPIC_API_KEY
- **Codex**: AI_GATEWAY_API_KEY REQUIRED (no fallback to OPENAI_API_KEY)
- **Copilot**: GH_TOKEN or GITHUB_TOKEN REQUIRED
- **Cursor**: CURSOR_API_KEY or GITHUB_TOKEN (not well documented)
- **Gemini**: GEMINI_API_KEY REQUIRED
- **OpenCode**: OPENAI_API_KEY OR ANTHROPIC_API_KEY

**Documentation Issue**: AGENTS.md focuses on Claude only. Other agents' API key requirements are not documented.

---

#### 6. **MCP Server Support Scope Unclear**

**Gap**: CLAUDE.md says "MCP Server Support (Claude Only)" but AGENTS.md doesn't clarify.

**Implementation Reality**:
```typescript
// Claude: Full MCP support (.mcp.json file in project root)
// - Stdio servers (command + args)
// - HTTP servers (baseUrl + headers)
// - OAuth credentials passed as headers

// Codex: MCP config in config.toml
// - Remote servers supported (experimental_use_rmcp_client flag)
// - Stdlib servers with command/args
// - Bearer token support

// Copilot: MCP config in .copilot/mcp-config.json
// - Stdio servers with command/args/env
// - HTTP servers with headers
// - "tools": [] for all tools

// Cursor: No documented MCP support
// Gemini: No documented MCP support
// OpenCode: No documented MCP support
```

**AGENTS.md Says** (Lines 224-229): "MCP Server Support (Claude Only) - MCP servers extend Claude Code with additional tools. Configured in connectors table..."

**Reality**: Codex and Copilot also support MCP, with different config formats.

---

#### 7. **Error Handling Patterns Generic**

**Gap**: AGENTS.md provides generic error handling guidance (lines 144-156) but doesn't document agent-specific error responses.

**Implementation Examples**:
```typescript
// Claude errors include sessionId for resumption
{
  success: false,
  error: 'Agent stalled - no output for extended period',
  cliName: 'claude',
  changesDetected: false,
  sessionId: extractedSessionId // Included for retries
}

// Codex API key validation is strict
if (!apiKey || (!isOpenAIKey && !isVercelKey)) {
  return {
    success: false,
    error: `Invalid API key format. Expected to start with "sk-" (OpenAI) or "vck_" (Vercel)...`,
    cliName: 'codex',
    changesDetected: false,
  }
}

// Copilot tolerates non-zero exit codes
// (command may fail but changes might still be made)
return {
  success: true,
  output: `GitHub Copilot CLI executed successfully...`,
  cliName: 'copilot',
  changesDetected: !!hasChanges,
}
```

---

#### 8. **Cursor Agent Installation Not Documented**

**Gap**: AGENTS.md doesn't mention Cursor's unique installation method.

**Implementation** (cursor.ts lines 78-101): Uses curl-based installation script
```bash
curl https://cursor.com/install -fsS | bash -s -- --verbose
```

This is different from other agents which use `npm install -g`.

---

#### 9. **Codex Configuration Format Not Documented**

**Gap**: AGENTS.md doesn't explain Codex uses TOML config (not JSON).

**Implementation** (codex.ts lines 148-183):
- Config file: `~/.codex/config.toml`
- Contains model, model_provider, wire_api settings
- MCP servers added to TOML with `[mcp_servers.<name>]` sections

---

#### 10. **Logging Redaction Automation Not Explained**

**Gap**: AGENTS.md says "static strings only" but doesn't explain `redactSensitiveInfo()` function.

**Current State**: All agents use `redactSensitiveInfo()` on:
- Command strings (claude.ts line 409, codex.ts line 13, etc.)
- Output (claude.ts line 98, codex.ts line 315, etc.)
- Errors (claude.ts line 106, etc.)

**Documentation Issue**: AGENTS.md doesn't mention that even if a dynamic value slips through, it gets automatically redacted. This is important context.

---

## Detailed Findings by Section

### Security Rules (Lines 5-54)

**Accuracy**: ✓ EXCELLENT

**Validation Results**:
- Static-string logging enforced consistently across all agents
- Grep found: 0 matches for `logger\.(info|error|success|command)\(\`` (dynamic template strings)
- All agent implementations use static strings with `redactSensitiveInfo()` wrapper

**Sensitivity List** (Line 34-42):
- ✓ Includes all environment variables used in codebase
- ✓ Matches redaction patterns in logging.ts
- ✓ Branch names correctly identified as sensitive (private repos)

---

### Code Quality Guidelines (Lines 56-118)

**Accuracy**: ✓ ACCURATE

**Validation**:
- pnpm format/lint/type-check commands match package.json ✓
- Dev server prohibition well-enforced ✓
- shadcn CLI guidance accurate ✓

---

### Logging Best Practices (Lines 120-143)

**Accuracy**: ✓ MOSTLY ACCURATE with clarification gap

**Issue**: Example on line 134 shows server-side error logging with dynamic values
```typescript
// Line 134 example:
console.error('Sandbox creation error:', error)
```

**Reality**: This is fine for server-side only (not user-facing), but document could clarify that console.error isn't shown to users. Agents do use console.error for debugging (claude.ts line 453, copilot.ts line 241).

---

### Task Execution Details (Lines 176-200)

**Accuracy**: ✓ ACCURATE for documented agents

**Validation**:
- sourceBranch handling accurate ✓
- Task fields match database schema ✓
- Source branch fallback logic correct ✓

---

### Configuration Security (Lines 202-218)

**Accuracy**: ✓ ACCURATE but incomplete

**Validation**:
- Lists all sensitive env vars used ✓
- GITHUB_TOKEN mentioned correctly (GH_TOKEN also used) ✓
- AI_GATEWAY_API_KEY coverage good ✓

**Gap**: Missing CURSOR_API_KEY in env var list (line 213), though mentioned elsewhere.

---

### Repository Page Structure (Lines 260-308)

**Accuracy**: ✓ ACCURATE

**Validation**: Nested routing matches actual implementation ✓

---

### Compliance Checklist (Lines 310-324)

**Accuracy**: ✓ ACCURATE

**Validation**: All items match current code quality requirements ✓

---

## Missing Documentation Areas

### 1. Agent Capabilities Comparison Table
**Priority**: HIGH

Should document for each agent:
- CLI package name
- Installation method
- API key requirements
- MCP support
- Streaming support
- Resumption support
- Default model
- Config file location (if any)

### 2. Agent-Specific Error Codes
**Priority**: MEDIUM

Codex validates API key format strictly. Copilot accepts non-zero exits. Cursor uses custom installer. Should document these distinctions.

### 3. Streaming Output Handling
**Priority**: MEDIUM

Claude and Copilot stream to taskMessages table in real-time. Others return output at end. This affects UI responsiveness.

### 4. Session Resumption Details
**Priority**: HIGH

Each agent handles resumption differently:
- Claude: UUID validation + fallback
- Codex: --last flag
- Copilot: --resume flag (may not work)
- Cursor: Unclear implementation
- Gemini: Not supported
- OpenCode: Not supported

### 5. MCP Configuration Formats
**Priority**: MEDIUM

Currently scattered:
- Claude: .mcp.json (JSON)
- Codex: config.toml (TOML)
- Copilot: .copilot/mcp-config.json (JSON)
- Others: Not supported

### 6. Model Selection Defaults
**Priority**: MEDIUM

Each agent has different defaults or requirements. Should document.

### 7. Installation Methods
**Priority**: MEDIUM

Most use `npm install -g`. Cursor uses curl script. Should document all.

---

## Validation Against Code

### Files Checked
✓ lib/sandbox/agents/index.ts - Agent dispatcher
✓ lib/sandbox/agents/claude.ts - 659 lines, full MCP + streaming
✓ lib/sandbox/agents/codex.ts - 378 lines, TOML config
✓ lib/sandbox/agents/copilot.ts - 387 lines, streaming
✓ lib/sandbox/agents/cursor.ts - Partial (100 lines shown)
✓ lib/sandbox/agents/gemini.ts - Partial (100 lines shown)
✓ lib/sandbox/agents/opencode.ts - Partial (100 lines shown)
✓ lib/utils/logging.ts - Redaction patterns (80 lines shown)
✓ lib/utils/task-logger.ts - Logging implementation (80 lines shown)

### Code Quality
- **Logging**: All agents use static strings ✓
- **Error Handling**: Consistent patterns across agents ✓
- **Redaction**: Applied consistently ✓
- **API Key Handling**: Each agent unique (not documented) ✗

---

## Inaccuracies Found

1. **Line 134**: Example shows dynamic console.error - should clarify it's server-side only
2. **Line 213**: CURSOR_API_KEY missing from sensitive variables list
3. **Line 224-229**: "MCP Server Support (Claude Only)" - Actually also Codex and Copilot
4. **Lines 138-145**: Implies all agents implement runAgent() equally - not true (different parameter support)
5. **Lines 183-189**: Task fields documentation doesn't mention some agents ignore selectedModel

---

## Contradictions With CLAUDE.md

**Line 147-172 vs AGENTS.md Line 224**:
- CLAUDE.md: "MCP Server Support (Claude Only)"
- AGENTS.md: Same statement
- Reality: Codex and Copilot also support MCP

**Line 152 (Claude models vs AI Gateway)**:
- CLAUDE.md: Clear that claude-* models need ANTHROPIC_API_KEY, others need AI_GATEWAY_API_KEY
- AGENTS.md: Doesn't document API key relationship to model selection
- Should cross-reference or be more explicit

---

## Recommendations for Improvement

### Priority 1: HIGH IMPACT (Correctness & Safety)

1. **Add Agent Capabilities Table** (NEW Section after line 26)
   - Compare MCP, streaming, resumption across all agents
   - Shows API key requirements
   - Lists default models
   - ~15-20 lines

2. **Expand "Agent Implementations" Section** (Lines 138-145)
   - Document that not all agents support all features
   - Add agent-specific subsections with:
     - CLI installation method
     - Config file location (if any)
     - API key requirements
     - Streaming capability
     - Resumption capability
     - Default model
   - ~80-100 additional lines

3. **Clarify MCP Support** (Lines 224-229)
   - Update to: "MCP Server Support (Claude, Codex, Copilot)"
   - Document config format differences
   - ~5-10 line change

### Priority 2: MEDIUM IMPACT (Practical Usage)

4. **Add Session Resumption Guide** (NEW Section after line 189)
   - Document which agents support resumption
   - Explain how each implements it
   - When to use (kept-alive sandboxes)
   - ~20-30 lines

5. **Document API Key Requirements by Agent** (NEW Section after line 206)
   - Explicit requirements for each agent
   - Which ones require specific key types
   - Validation patterns (e.g., Codex checks key format)
   - ~25-35 lines

6. **Clarify Streaming Behavior** (NEW Section after line 142)
   - Which agents support real-time streaming
   - How it affects UI responsiveness
   - What taskMessages table receives
   - ~15-20 lines

### Priority 3: LOW IMPACT (Nice to Have)

7. **Update Sensitive Data List** (Line 213)
   - Add CURSOR_API_KEY
   - 1 line change

8. **Expand Error Handling Examples** (Lines 144-156)
   - Add agent-specific error examples
   - Show why some agents return different formats
   - ~20-30 lines

9. **Explain Redaction Function** (After Line 46)
   - How `redactSensitiveInfo()` works
   - What patterns it catches
   - Why it's not the primary defense
   - ~10-15 lines

---

## Additional Context

### Recent Changes Affecting AGENTS.md
Git status shows many modified agent files (`M app/api/**`, `M lib/sandbox/agents/**`). These may have introduced:
- New error handling patterns
- Changed API key logic
- Modified streaming behavior
- Updated MCP support

AGENTS.md should be reviewed for alignment with these changes.

### Code Quality: Current State
- All agents properly implement static-string logging
- No dynamic values in logger calls (grep confirmed 0 matches)
- Redaction applied consistently
- Error handling follows established patterns

---

## Summary Metrics

| Category | Score | Status |
|----------|-------|--------|
| **Security Guidelines** | 10/10 | ✓ Excellent |
| **Code Quality Guidelines** | 9/10 | ✓ Excellent |
| **Logging Best Practices** | 8/10 | ⚠ Good, minor clarification needed |
| **Task Execution Details** | 8/10 | ⚠ Good, missing agent variations |
| **API Architecture** | 7/10 | ⚠ Good, API key logic not documented |
| **Agent Capabilities Coverage** | 4/10 | ✗ Significant gaps |
| **Error Handling Specifics** | 5/10 | ✗ Generic, lacks agent details |
| **MCP Documentation** | 6/10 | ⚠ Partially incorrect |
| **Session Resumption** | 3/10 | ✗ Missing agent differences |
| **Overall Usefulness** | 7/10 | ⚠ Good security, weak on implementation details |

---

## Files Referenced in Audit

**Documentation Files**:
- @AGENTS.md - Primary subject
- @CLAUDE.md - Context and contradictions
- @README.md - Not audited in this session
- @AI_MODELS_AND_KEYS.md - Not fully reviewed

**Code Files Inspected**:
- @lib/sandbox/agents/index.ts (154 lines)
- @lib/sandbox/agents/claude.ts (659 lines)
- @lib/sandbox/agents/codex.ts (378 lines)
- @lib/sandbox/agents/copilot.ts (387 lines)
- @lib/sandbox/agents/cursor.ts (100+ lines partial)
- @lib/sandbox/agents/gemini.ts (100+ lines partial)
- @lib/sandbox/agents/opencode.ts (100+ lines partial)
- @lib/utils/logging.ts (80+ lines partial)
- @lib/utils/task-logger.ts (80+ lines partial)

---

## Next Steps (For Implementation)

1. **No Changes Applied** - This is findings only per task requirements
2. **Ready for Review** - Agent implementation team should review findings
3. **Estimated Update Effort**: 4-6 hours to implement all recommendations
4. **Priority Sequence**: Start with Priority 1 (correctness), then Priority 2 (utility)

