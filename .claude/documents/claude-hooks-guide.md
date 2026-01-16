# Claude Code Hooks: Practical Guide

**Quick Reference for Effective Hook Usage**
Last Updated: January 2025 | Project: Agentic Assets App

---

## What Are Hooks?

**Hooks** are shell commands that execute at specific points in Claude Code's lifecycle, giving you deterministic control over Claude's behavior without modifying Claude Code itself.

**Use them to**:
- ✅ Automate repetitive tasks (formatting, linting, type-checking)
- ✅ Block dangerous operations (security validation, file protection)
- ✅ Inject context dynamically (project status, relevant files)
- ✅ Enforce quality gates (tests must pass, builds must succeed)
- ✅ Customize workflows (TDD, pair programming, documentation-first)

---

## The 8 Hook Types (Quick Reference)

| Hook | When | Best For |
|------|------|----------|
| **SessionStart** | Session initialization | Display project status, git info, environment setup |
| **UserPromptSubmit** | After prompt, before processing | Log requests, inject context based on keywords |
| **PreToolUse** | Before tool executes | Security blocking, file protection, input validation |
| **PostToolUse** | After tool completes | Auto-format, type-check, tests, validation |
| **Notification** | Claude sends notification | Desktop alerts, activity tracking |
| **Stop** | Claude finishes response | Enforce quality gates (prevent stopping until tests pass) |
| **SubagentStop** | Subagent completes | Track delegation performance, validate outputs |
| **PreCompact** | Before context cleanup | Backup transcripts, preserve important context |

---

## Exit Codes Control Everything

| Code | Behavior | Use Case |
|------|----------|----------|
| **0** | ✅ Success - Allow/Continue | Normal completion, warnings shown |
| **2** | 🚫 Block - Deny/Force | Security blocks, quality gates enforcement |
| **Other** | ⚠️ Warning - Non-critical | Logging, informational messages |

**Examples**:

```bash
# PreToolUse: Block .env modification
if [[ "$file_path" == ".env" ]]; then
  echo "ERROR: Cannot modify .env files" >&2
  exit 2  # Blocks the tool
fi
exit 0  # Allow

# Stop: Prevent stopping until tests pass
pnpm test --silent || {
  echo "Tests failed. Please fix before stopping." >&2
  exit 2  # Forces continuation
}
exit 0  # Allow stopping
```

---

## Configuration Quick Start

**File Locations** (priority order):
1. `.claude/settings.local.json` - Personal overrides (NOT committed)
2. `.claude/settings.json` - Project-wide (committed)
3. `~/.claude/settings.json` - Global defaults

**Basic Structure**:

```json
{
  "hooks": {
    "HookEventName": [
      {
        "matcher": "ToolName|OtherTool",  // Optional: filter by tool
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/script-name.sh"
          }
        ]
      }
    ]
  }
}
```

**Key Rules**:
- Matcher is case-sensitive: `"Edit|Write"` (use pipe `|` for multiple)
- No matcher = applies to all tool invocations
- Order matters: hooks execute sequentially
- Make scripts executable: `chmod +x .claude/hooks/*.sh`

---

## Environment Variables

**Available in All Hooks**:
- `$CLAUDE_TOOL_NAME` - Tool name (Edit, Write, Bash, Read, etc.)
- `$CLAUDE_HOOK_EVENT` - Hook type (SessionStart, PreToolUse, etc.)

**Via stdin (JSON)**:
- `$CLAUDE_TOOL_INPUT` - Tool parameters (parse with `jq`)
- `$CLAUDE_TOOL_OUTPUT` - Tool result (PostToolUse only)

**Hook-Specific**:
- `$CLAUDE_PROMPT` - User's prompt (UserPromptSubmit)
- `$CLAUDE_SUBAGENT_TYPE` - Subagent ID (SubagentStop)

**Example**:
```bash
#!/bin/bash
tool_input=$(cat)  # Read JSON from stdin
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')
```

---

## Your Project's Active Hooks

You already have **6 hooks configured** in this project:

### 1. Auto-Inject Begin Command (`auto-inject-begin.sh`)
**Trigger**: UserPromptSubmit (after every user message)
**Action**: Automatically injects `/begin` command content to remind Claude to:
- Act as an orchestrator of specialized AI agents
- Delegate work to the 12 specialized subagents
- Launch agents in parallel when possible
- Preserve context through concise responses

This ensures consistent agent-based workflow throughout conversations.

### 2. Auto-Format (`auto-format.sh`)
**Trigger**: PostToolUse (Edit|Write)
**Files**: `*.ts`, `*.tsx`, `*.js`, `*.jsx`
**Action**: Runs `pnpm eslint --fix` automatically after every edit

### 3. Type Check (`type-check-file.sh`)
**Trigger**: PostToolUse (Edit|Write)
**Files**: `*.ts`, `*.tsx`
**Action**: Runs `pnpm tsc --noEmit` to catch type errors immediately (non-blocking)

### 4. Enforce pnpm (`enforce-pnpm.sh`)
**Trigger**: PreToolUse (Bash)
**Action**: Blocks npm/yarn and enforces pnpm usage:
- Detects `npm` commands → Suggests `pnpm` equivalent
- Detects `yarn` commands → Suggests `pnpm` equivalent
- Ensures project uses pnpm@9.12.3 exclusively (per package.json)

### 5. Security Validation (`validate-bash-security.sh`)
**Trigger**: PreToolUse (Bash)
**Action**: Blocks dangerous commands:
- Root deletion (`rm -rf /`)
- Privileged deletion (`sudo rm`)
- Insecure permissions (`chmod 777`)
- Disk operations (`dd if=`)
- Fork bombs and pipe-to-shell attacks

### 6. Documentation Check (`pre-stop-doc-check.sh`)
**Trigger**: Stop (before conversation ends)
**Action**: Intelligently analyzes changed files and reminds to update documentation:
- Detects which subsystems were modified (AI, DB, components, etc.)
- Suggests specific docs to update (CLAUDE.md, module CLAUDE.md files, AGENTS.md, README.md)
- Provides guidelines for concise, context-aware documentation
- Only triggers for user-visible or workflow-affecting changes

---

## Performance Best Practices

**Execution Time Budget**:
- PreToolUse: **< 100ms** (blocks tool execution!)
- PostToolUse: **< 2s** (delays next operation)
- SessionStart: **< 5s** (one-time startup cost)

**Optimization Techniques**:

**1. Conditional Execution** (fastest):
```bash
# Skip non-TS files immediately
if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
  exit 0  # Fast path
fi
```

**2. Caching**:
```bash
# Cache by file hash
cache_key=$(md5sum "$file_path" | cut -d' ' -f1)
[ -f "/tmp/typecheck-$cache_key" ] && exit 0
# ... do expensive work ...
touch "/tmp/typecheck-$cache_key"
```

**3. Background Processing** (PostToolUse):
```bash
# Don't block on slow operations
(pnpm build --silent > .claude/logs/build.log 2>&1) &
exit 0
```

**4. Timeout Long Operations**:
```bash
timeout 300 pnpm build  # Max 5 minutes
[ $? -eq 124 ] && echo "Build timeout" >&2
```

---

## Recommended Setup for This Project

### Minimal Setup (Start Here)

**Add to `.claude/settings.local.json`**:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command", "command": ".claude/hooks/session-start.sh"}]
    }],
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{"type": "command", "command": ".claude/hooks/enforce-pnpm.sh"}]
    }]
  }
}
```

**Why?**
- SessionStart displays git status, recent commits, health checks
- enforce-pnpm blocks npm/yarn (project requires pnpm@9.12.3)

### Quality Assurance Setup

**Add PostToolUse hooks for code quality**:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [
        {"type": "command", "command": ".claude/hooks/auto-format.sh"},
        {"type": "command", "command": ".claude/hooks/validate-ai-sdk-v5.sh"},
        {"type": "command", "command": ".claude/hooks/type-check-file.sh"}
      ]
    }]
  }
}
```

**Why?**
- auto-format: Ensures code style consistency
- validate-ai-sdk-v5: Catches AI SDK v4 patterns (deprecated)
- type-check-file: Immediate TypeScript error feedback

### Security-Focused Setup

**Add PreToolUse hooks for protection**:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{"type": "command", "command": ".claude/hooks/protect-db-schema.sh"}]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {"type": "command", "command": ".claude/hooks/enforce-pnpm.sh"},
          {"type": "command", "command": ".claude/hooks/validate-bash-security.sh"}
        ]
      }
    ]
  }
}
```

**Why?**
- protect-db-schema: Prevents accidental schema modifications (requires migrations)
- enforce-pnpm: Blocks npm/yarn usage (project standard)
- validate-bash-security: Blocks dangerous shell commands

---

## Project-Specific Hook Examples

### 1. AI SDK 5 Pattern Validator

**Purpose**: Catch deprecated AI SDK v4 patterns (maxTokens, parameters, CoreMessage)

**Script** (`.claude/hooks/validate-ai-sdk-v5.sh`):
```bash
#!/bin/bash
tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only check AI files
[[ ! "$file_path" =~ (lib/ai|app/.*chat) ]] && exit 0

# Check for v4 patterns
if grep -qE '\bmaxTokens\s*:' "$file_path"; then
  echo "❌ AI SDK v5: Use 'maxOutputTokens' instead of 'maxTokens'" >&2
fi

if grep -q 'CoreMessage' "$file_path"; then
  echo "❌ AI SDK v5: Use 'ModelMessage' instead of 'CoreMessage'" >&2
fi

exit 0  # Warn but don't block
```

### 2. Database Schema Protection

**Purpose**: Prevent accidental schema modifications without migrations

**Script** (`.claude/hooks/protect-db-schema.sh`):
```bash
#!/bin/bash
tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

protected_files=("lib/db/schema.ts" "drizzle.config.ts")

for protected in "${protected_files[@]}"; do
  if [[ "$file_path" == *"$protected"* ]]; then
    echo "🔒 BLOCKED: $file_path is a critical database file" >&2
    echo "   Use migrations: pnpm db:generate && pnpm db:migrate" >&2
    exit 2  # Block
  fi
done
exit 0
```

### 3. Enforce pnpm Package Manager

**Purpose**: Block npm/yarn (project uses pnpm@9.12.3)

**Script** (`.claude/hooks/enforce-pnpm.sh`):
```bash
#!/bin/bash
tool_input=$(cat)
command=$(echo "$tool_input" | jq -r '.command // empty')

if echo "$command" | grep -qE '^\s*(npm|yarn)\s'; then
  echo "🚫 BLOCKED: This project uses pnpm exclusively" >&2
  echo "   Use: ${command//npm/pnpm}" >&2
  exit 2  # Block
fi
exit 0
```

### 4. Session Start Dashboard

**Purpose**: Display project status at session start

**Script** (`.claude/hooks/session-start.sh`):
```bash
#!/bin/bash

echo "📋 Agentic Assets App - Session Context" >&2
echo "========================================" >&2

# Git status
echo "📍 Branch: $(git branch --show-current)" >&2
git status --short 2>&1 | head -10 >&2
echo "" >&2

# Recent commits
echo "📝 Recent Commits:" >&2
git log --oneline -5 >&2
echo "" >&2

# Environment
echo "🔧 Environment:" >&2
echo "   • pnpm: $(pnpm --version)" >&2
echo "   • node: $(node --version)" >&2
echo "" >&2

# Key reminders
echo "💡 Key Reminders:" >&2
echo "   • AI SDK 5: maxOutputTokens, inputSchema, ModelMessage" >&2
echo "   • Before commit: pnpm lint:fix && pnpm type-check" >&2
echo "   • Before push: pnpm build" >&2

exit 0
```

---

## Testing Your Hooks

### Test Individual Hook

```bash
# Create mock input
echo '{"file_path": "test.ts"}' | .claude/hooks/your-hook.sh
echo "Exit code: $?"

# Test blocking
echo '{"file_path": ".env"}' | .claude/hooks/protect-db-schema.sh
echo "Exit code: $?"  # Should be 2 (blocked)
```

### Test Performance

```bash
# Measure execution time
time echo '{"file_path": "test.ts"}' | .claude/hooks/type-check-file.sh
```

### Validate JSON Config

```bash
# Check for syntax errors
jq . .claude/settings.local.json
```

---

## Common Pitfalls to Avoid

❌ **Forgetting to make scripts executable**
✅ `chmod +x .claude/hooks/*.sh`

❌ **Blocking too aggressively** (exit 2 everywhere)
✅ Use warnings (exit 0 + stderr) for non-critical issues

❌ **Long-running PreToolUse hooks** (blocks execution)
✅ Move to PostToolUse or use background processing

❌ **Not handling missing tools**
✅ Check for dependencies: `command -v prettier &> /dev/null`

❌ **Hardcoding paths**
✅ Use relative paths and environment variables

❌ **Committing personal settings**
✅ Add `.claude/settings.local.json` to `.gitignore`

---

## Security Best Practices

### 1. Use Allowlists, Not Denylists

```bash
# Bad - easy to bypass
[[ "$cmd" =~ "rm -rf" ]] && exit 2

# Good - explicit allow
allowed=("git status" "pnpm lint" "pnpm test")
[[ ! " ${allowed[@]} " =~ " $cmd " ]] && exit 2
```

### 2. Validate All Inputs

```bash
# Sanitize file paths
file_path=$(echo "$tool_input" | jq -r '.file_path' | sed 's/[^a-zA-Z0-9._/-]//g')
```

### 3. Protect Sensitive Data

```bash
# Prevent logging secrets
if echo "$content" | grep -qE 'API_KEY|SECRET|PASSWORD'; then
  echo "WARNING: Sensitive data detected" >&2
  # Redact before logging
fi
```

### 4. Dangerous Bash Patterns to Block

- Root deletion: `rm -rf /`
- Privileged deletion: `sudo rm`
- Insecure permissions: `chmod 777`
- Disk operations: `dd if=`, `mkfs.`
- Pipe-to-shell: `curl | bash`, `wget | sh`
- Fork bombs: `:(){:|:&};:`

---

## Next Steps

1. **Review existing hooks**: Check `.claude/settings.json` to see what's configured
2. **Start minimal**: Add SessionStart + enforce-pnpm to `.claude/settings.local.json`
3. **Test independently**: Run hooks manually with mock input before enabling
4. **Add quality hooks**: Enable auto-format, type-check, AI SDK validation
5. **Iterate**: Add more hooks as you identify workflow friction points

---

## Reference Documentation

Your project has comprehensive hook documentation:

- **`hooks-best-practices.md`** - Complete reference (8 hook types, exit codes, advanced patterns)
- **`hooks-strategies.md`** - Codebase-specific strategies for Next.js/AI SDK projects
- **`hooks-examples.md`** - 12 production-ready copy-paste examples
- **`hooks/README.md`** - Quick reference for active hooks

**Official Documentation**:
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)

---

**Last Updated**: January 2025
**Project**: Agentic Assets App (Next.js 16 + React 19 + AI SDK 5 + Supabase)
**Compatibility**: Claude Code v2.0.10+
