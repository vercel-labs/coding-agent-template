# Claude Code Hooks: Comprehensive Best Practices Guide

## Table of Contents
1. [Introduction to Hooks](#introduction-to-hooks)
2. [The 8 Hook Types](#the-8-hook-types)
3. [Configuration Fundamentals](#configuration-fundamentals)
4. [Exit Codes & Control Flow](#exit-codes--control-flow)
5. [Advanced Patterns](#advanced-patterns)
6. [Best Practices](#best-practices)
7. [Performance & Security](#performance--security)

---

## Introduction to Hooks

**Hooks** are user-defined shell commands that execute at specific points in Claude Code's lifecycle, providing deterministic control over Claude's behavior. They enable automation, validation, and custom workflows without modifying Claude Code itself.

### Key Benefits

- **Consistency**: Automate repetitive tasks (linting, testing, formatting)
- **Security**: Block dangerous operations before execution
- **Context Enhancement**: Inject project-specific information
- **Quality Assurance**: Enforce standards and prevent errors
- **Flexibility**: Adapt Claude to your exact workflow

---

## The 8 Hook Types

### 1. **SessionStart**
**When**: New or resumed session initialization
**Use Cases**:
- Load project context (git status, recent issues)
- Initialize environment variables
- Display project status dashboard
- Auto-load frequently referenced files

**Example**:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "git status --short && echo '\n=== Recent Commits ===' && git log --oneline -5"
          }
        ]
      }
    ]
  }
}
```

---

### 2. **UserPromptSubmit**
**When**: After user submits a prompt, before Claude processes it
**Use Cases**:
- Log user requests for audit trails
- Inject dynamic context based on prompt content
- Validate prompts against project rules
- Add relevant file context automatically

**Example**:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date '+%Y-%m-%d %H:%M:%S')] User prompt logged\" >> .claude/logs/prompts.log"
          }
        ]
      }
    ]
  }
}
```

**Advanced Pattern** (Context Injection):
```bash
# Check if prompt mentions "database" and inject schema context
if echo "$CLAUDE_PROMPT" | grep -qi "database"; then
  echo "# Database Schema Context" >> /tmp/context.md
  cat lib/db/schema.ts >> /tmp/context.md
fi
```

---

### 3. **PreToolUse**
**When**: Before any tool executes (Read, Edit, Write, Bash, etc.)
**Use Cases**:
- **Security validation**: Block dangerous commands
- **File protection**: Prevent edits to sensitive files
- **Logging**: Track all tool invocations
- **Input modification**: Transform tool parameters (v2.0.10+)

**Example** (Block Sensitive Files):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import sys, json; data=json.load(sys.stdin); path=data.get('file_path',''); sys.exit(2 if any(s in path for s in ['.env', 'credentials', '.git/']) else 0)\""
          }
        ]
      }
    ]
  }
}
```

**Example** (Block Dangerous Bash):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import sys, json, re; data=json.load(sys.stdin); cmd=data.get('command',''); dangerous=re.search(r'rm\\s+-rf|sudo\\s+rm|chmod\\s+777|dd\\s+if=', cmd); sys.exit(2 if dangerous else 0)\""
          }
        ]
      }
    ]
  }
}
```

---

### 4. **PostToolUse**
**When**: After a tool completes execution
**Use Cases**:
- **Auto-formatting**: Format files after edits
- **Validation**: Run linters/type-checkers
- **Testing**: Execute tests after code changes
- **Logging**: Record tool results

**Example** (Auto-format TypeScript):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if [[ \"$CLAUDE_TOOL_INPUT\" =~ \\.tsx?$ ]]; then FILE=$(echo \"$CLAUDE_TOOL_INPUT\" | jq -r \".file_path\"); pnpm prettier --write \"$FILE\" 2>/dev/null; fi'"
          }
        ]
      }
    ]
  }
}
```

**Example** (Run Tests After Changes):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if [[ \"$CLAUDE_TOOL_INPUT\" =~ \\.(ts|tsx)$ ]]; then pnpm test --related \"$(echo \"$CLAUDE_TOOL_INPUT\" | jq -r \".file_path\")\" --silent 2>&1 | head -20; fi'"
          }
        ]
      }
    ]
  }
}
```

---

### 5. **Notification**
**When**: Claude sends a notification (awaiting input, error, etc.)
**Use Cases**:
- Desktop notifications
- Audio alerts
- Slack/Discord integration
- Activity tracking

**Example** (Desktop Notification):
```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Awaiting your input' --urgency=normal"
          }
        ]
      }
    ]
  }
}
```

---

### 6. **Stop**
**When**: Claude finishes a response
**Use Cases**:
- Enforce quality gates (tests must pass)
- Final validation before continuing
- Session cleanup
- Metrics collection

**Example** (Prevent Stop Until Tests Pass):
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'pnpm test --silent && exit 0 || exit 2'"
          }
        ]
      }
    ]
  }
}
```

---

### 7. **SubagentStop**
**When**: A subagent (Task tool) completes
**Use Cases**:
- Track subagent performance
- Validate subagent outputs
- Log delegation patterns
- Enforce subagent standards

**Example**:
```json
{
  "hooks": {
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date)] Subagent completed: $CLAUDE_SUBAGENT_TYPE\" >> .claude/logs/subagents.log"
          }
        ]
      }
    ]
  }
}
```

---

### 8. **PreCompact**
**When**: Before session compaction (context cleanup)
**Use Cases**:
- Backup conversation transcripts
- Archive session artifacts
- Generate session summaries
- Preserve important context

**Example**:
```json
{
  "hooks": {
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "mkdir -p .claude/backups && cp .claude/transcript.jsonl \".claude/backups/transcript-$(date +%Y%m%d-%H%M%S).jsonl\""
          }
        ]
      }
    ]
  }
}
```

---

## Configuration Fundamentals

### File Locations

1. **Global**: `~/.claude/settings.json` - Applies to all projects
2. **Project**: `.claude/settings.json` - Project-specific, committed to repo
3. **Local**: `.claude/settings.local.json` - Local overrides, NOT committed

### Basic Structure

```json
{
  "hooks": {
    "HookEventName": [
      {
        "matcher": "ToolName|OtherTool",  // Optional: filter by tool
        "hooks": [
          {
            "type": "command",
            "command": "your-shell-command-here"
          }
        ]
      }
    ]
  }
}
```

### Environment Variables Available

- `$CLAUDE_PROMPT` - User's prompt text (UserPromptSubmit)
- `$CLAUDE_TOOL_NAME` - Tool being invoked (PreToolUse, PostToolUse)
- `$CLAUDE_TOOL_INPUT` - JSON tool parameters (stdin)
- `$CLAUDE_TOOL_OUTPUT` - Tool result (PostToolUse, stdin)
- `$CLAUDE_SUBAGENT_TYPE` - Subagent identifier (SubagentStop)

---

## Exit Codes & Control Flow

### Exit Code Meanings

| Code | Behavior | Claude's Response | Use Case |
|------|----------|-------------------|----------|
| **0** | Success | stdout visible (transcript mode) | Normal completion |
| **2** | **BLOCK** | stderr fed to Claude | Security blocking, validation failures |
| **Other** | Warning | stderr shown to user | Non-critical issues, logging |

### Blocking Examples

**Block File Write**:
```bash
#!/bin/bash
# Exit 2 blocks the tool, Claude sees error message
if [[ "$file_path" == ".env" ]]; then
  echo "ERROR: Cannot modify .env files" >&2
  exit 2
fi
exit 0
```

**Force Continuation** (Stop hook):
```bash
#!/bin/bash
# Exit 2 in Stop hook prevents Claude from stopping
pnpm test --silent
if [ $? -ne 0 ]; then
  echo "Tests failed. Please fix before stopping." >&2
  exit 2
fi
exit 0
```

### JSON Control Flow (Advanced)

**PreToolUse** (v2.0.10+):
```json
{
  "decision": "approve",        // or "block"
  "modifiedInput": { ... },     // Transform tool parameters
  "continue": true,
  "stopReason": "explanation"
}
```

**Stop Hook**:
```json
{
  "decision": "block",          // Forces continuation
  "continue": false,
  "stopReason": "Tests must pass before stopping"
}
```

---

## Advanced Patterns

### Pattern 1: Conditional Context Injection

```bash
#!/bin/bash
# UserPromptSubmit hook - inject context based on keywords

prompt="$CLAUDE_PROMPT"

# Database-related queries
if echo "$prompt" | grep -qi "database\|schema\|migration"; then
  echo "# Relevant Database Context" >&2
  echo "## Schema Definition" >&2
  head -50 lib/db/schema.ts >&2
  echo "## Recent Migrations" >&2
  ls -1t lib/db/migrations/*.sql | head -3 | xargs -I {} basename {} >&2
fi

# AI/LLM-related queries
if echo "$prompt" | grep -qi "ai\|llm\|model\|streaming"; then
  echo "# AI SDK Context" >&2
  cat .claude/references/AI_SDK_5_QUICK_REF.md >&2
fi

exit 0
```

### Pattern 2: Multi-Tool Validation Pipeline

```bash
#!/bin/bash
# PostToolUse hook - comprehensive validation

tool_input=$(cat)  # Read JSON from stdin
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

if [[ -z "$file_path" ]]; then
  exit 0  # Not a file operation
fi

# Step 1: Format
if [[ "$file_path" =~ \.(ts|tsx|js|jsx)$ ]]; then
  pnpm prettier --write "$file_path" 2>/dev/null
fi

# Step 2: Lint
if [[ "$file_path" =~ \.(ts|tsx)$ ]]; then
  pnpm eslint --fix "$file_path" 2>/dev/null
fi

# Step 3: Type Check
if [[ "$file_path" =~ \.(ts|tsx)$ ]]; then
  pnpm tsc --noEmit "$file_path" 2>&1 | head -20 >&2
fi

exit 0
```

### Pattern 3: Security Allowlist

```python
#!/usr/bin/env python3
# PreToolUse hook - security validation with allowlist

import sys
import json
import re

# Read tool input
data = json.load(sys.stdin)
tool_name = os.environ.get('CLAUDE_TOOL_NAME', '')

# Bash command validation
if tool_name == 'Bash':
    command = data.get('command', '')

    # Dangerous patterns
    dangerous = [
        r'rm\s+-rf\s+/',           # Root deletion
        r'sudo\s+rm',              # Privileged deletion
        r'chmod\s+777',            # Insecure permissions
        r'dd\s+if=',               # Disk operations
        r'>\s*/dev/sd[a-z]',       # Disk writes
        r'mkfs\.',                 # Format disk
    ]

    for pattern in dangerous:
        if re.search(pattern, command, re.IGNORECASE):
            print(f"BLOCKED: Dangerous command pattern detected: {pattern}", file=sys.stderr)
            sys.exit(2)

# File write validation
if tool_name in ['Edit', 'Write']:
    file_path = data.get('file_path', '')

    # Protected paths
    protected = [
        '.env',
        '.git/',
        'node_modules/',
        '.claude/settings.json',
        'package.json',
    ]

    for pattern in protected:
        if pattern in file_path:
            print(f"BLOCKED: Cannot modify protected file: {file_path}", file=sys.stderr)
            sys.exit(2)

sys.exit(0)
```

### Pattern 4: TDD Workflow Enforcement

```bash
#!/bin/bash
# PostToolUse hook - enforce TDD by running tests after code changes

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only for source files, not test files
if [[ "$file_path" =~ \.(ts|tsx)$ ]] && [[ ! "$file_path" =~ \.test\. ]]; then
  echo "Running tests for: $file_path" >&2

  # Run related tests
  pnpm test --related "$file_path" --silent 2>&1 | tee /tmp/test-results.txt | head -30 >&2

  # Check if tests passed
  if ! grep -q "PASS" /tmp/test-results.txt; then
    echo "" >&2
    echo "⚠️  Tests failed. Please fix before continuing." >&2
    # Don't block (exit 0), just warn
  fi
fi

exit 0
```

### Pattern 5: Intelligent Logging

```bash
#!/bin/bash
# Universal logging hook for all tool uses

mkdir -p .claude/logs

# Log file with timestamp
log_file=".claude/logs/tools-$(date +%Y-%m-%d).jsonl"

# Create log entry
cat > /tmp/log-entry.json <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "tool": "$CLAUDE_TOOL_NAME",
  "event": "$CLAUDE_HOOK_EVENT",
  "input": $(cat | jq -c '.'),
  "session_id": "$(uuidgen)"
}
EOF

# Append to daily log
cat /tmp/log-entry.json >> "$log_file"

exit 0
```

---

## Best Practices

### 1. Start Simple, Iterate
- Begin with one hook at a time
- Test thoroughly before adding complexity
- Use `.claude/settings.local.json` for experimentation

### 2. Use Dedicated Scripts Directory
```bash
# Instead of inline bash:
.claude/hooks/validate-security.sh
.claude/hooks/format-files.sh
.claude/hooks/run-tests.sh

# Call from settings.json:
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": ".claude/hooks/validate-security.sh"}]
      }
    ]
  }
}
```

### 3. Make Scripts Executable
```bash
chmod +x .claude/hooks/*.sh
```

### 4. Handle Missing Dependencies Gracefully
```bash
#!/bin/bash
# Check if prettier exists before running
if command -v prettier &> /dev/null; then
  prettier --write "$file_path"
else
  echo "prettier not found, skipping format" >&2
fi
exit 0
```

### 5. Use Exit 2 Sparingly
- Only block for critical security/safety issues
- Use warnings (exit 0 + stderr) for non-critical issues
- Blocking too often frustrates workflows

### 6. Provide Clear Error Messages
```bash
# Bad
exit 2

# Good
echo "ERROR: Cannot modify .env files for security reasons." >&2
echo "If you need to update environment variables, do so manually." >&2
exit 2
```

### 7. Log Strategically
- Log security events (blocked operations)
- Log tool usage patterns for analysis
- Rotate logs to prevent disk bloat

### 8. Test Hooks Independently
```bash
# Test a PreToolUse hook manually
echo '{"file_path": ".env"}' | .claude/hooks/validate-security.sh
echo "Exit code: $?"
```

### 9. Version Control
- Commit `.claude/settings.json` with project-specific hooks
- Add `.claude/settings.local.json` to `.gitignore`
- Document hooks in project README

### 10. Performance Considerations
- Avoid long-running operations in PreToolUse (blocks execution)
- Use background processes for slow tasks
- Cache results when possible

---

## Performance & Security

### Performance Tips

**Fast Operations Only** (PreToolUse):
```bash
# Bad - slow database query
psql -c "SELECT COUNT(*) FROM users" > /dev/null

# Good - fast file check
test -f .env && exit 2 || exit 0
```

**Background Processing** (PostToolUse):
```bash
# Run expensive operations in background
(pnpm build --silent > .claude/logs/build.log 2>&1) &
exit 0
```

**Caching**:
```bash
# Cache expensive computations
cache_file="/tmp/claude-hook-cache.json"
if [ -f "$cache_file" ] && [ $(($(date +%s) - $(stat -f%m "$cache_file"))) -lt 300 ]; then
  cat "$cache_file"
  exit 0
fi

# Compute and cache
compute_expensive_data > "$cache_file"
cat "$cache_file"
exit 0
```

### Security Best Practices

1. **Validate All Inputs**
```bash
# Sanitize file paths
file_path=$(echo "$tool_input" | jq -r '.file_path' | sed 's/[^a-zA-Z0-9._/-]//g')
```

2. **Use Allowlists, Not Denylists**
```bash
# Bad - denylist (easy to bypass)
if [[ "$cmd" =~ "rm -rf" ]]; then exit 2; fi

# Good - allowlist
allowed_commands=("git status" "pnpm lint" "pnpm test")
if [[ ! " ${allowed_commands[@]} " =~ " ${cmd} " ]]; then
  exit 2
fi
```

3. **Protect Sensitive Data**
```bash
# Prevent accidental logging of secrets
if echo "$content" | grep -qE 'API_KEY|SECRET|PASSWORD'; then
  echo "WARNING: Sensitive data detected" >&2
  # Redact before logging
fi
```

4. **Limit Permissions**
```bash
# Run hooks with minimal privileges
# Use dedicated service account for production
```

5. **Audit Hook Changes**
```bash
# SessionStart hook - alert on hook modifications
if git diff HEAD~1 -- .claude/settings.json | grep -q hooks; then
  echo "⚠️  Hook configuration changed in last commit" >&2
  git diff HEAD~1 -- .claude/settings.json >&2
fi
```

---

## Common Pitfalls to Avoid

❌ **Forgetting to make scripts executable**
```bash
chmod +x .claude/hooks/*.sh
```

❌ **Blocking too aggressively** - Use warnings instead of exit 2 when possible

❌ **Ignoring stderr** - Always provide clear error messages

❌ **Not handling missing tools** - Check for dependencies before using them

❌ **Long-running PreToolUse hooks** - Move to PostToolUse or background

❌ **Hardcoding paths** - Use relative paths and environment variables

❌ **No error handling** - Always validate inputs and handle edge cases

❌ **Forgetting `.local.json` in `.gitignore`** - Prevent committing personal settings

---

## Next Steps

1. Read **hooks-strategies.md** for codebase-specific strategies
2. Read **hooks-examples.md** for practical, copy-paste examples
3. Start with one simple hook (e.g., SessionStart git status)
4. Gradually add more hooks as you identify workflow friction points
5. Share successful patterns with your team

---

**Last Updated**: January 2025
**Version**: 1.0.0
**Compatibility**: Claude Code v2.0.10+
