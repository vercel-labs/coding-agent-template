# Claude Code Hooks: Codebase-Specific Strategies

## Project Context

**Codebase**: Next.js 16 + React 19 + Vercel AI SDK 5 + Supabase
**Package Manager**: pnpm@9.12.3 (enforced)
**Key Technologies**: Turbopack, Tailwind v4, Drizzle ORM, pgvector, shadcn/ui

---

## Strategic Hook Implementations for This Codebase

### 1. AI SDK 5 Compatibility Enforcement

**Problem**: AI SDK v4 patterns break in v5 (maxTokens → maxOutputTokens, etc.)
**Solution**: PostToolUse hook validates AI SDK patterns

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/validate-ai-sdk-v5.sh"
          }
        ]
      }
    ]
  }
}
```

**Script** (`.claude/hooks/validate-ai-sdk-v5.sh`):
```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only check AI-related files
if [[ ! "$file_path" =~ (lib/ai|app/.*api.*chat) ]]; then
  exit 0
fi

# Check for deprecated v4 patterns
if [ -f "$file_path" ]; then
  violations=""

  # maxTokens → maxOutputTokens
  if grep -q "maxTokens:" "$file_path"; then
    violations+="❌ Use maxOutputTokens instead of maxTokens (AI SDK v5)\n"
  fi

  # parameters → inputSchema
  if grep -q "parameters:" "$file_path" | grep -v "providerOptions"; then
    violations+="❌ Use inputSchema instead of parameters (AI SDK v5)\n"
  fi

  # CoreMessage → ModelMessage
  if grep -q "CoreMessage" "$file_path"; then
    violations+="❌ Use ModelMessage instead of CoreMessage (AI SDK v5)\n"
  fi

  # Missing consumeStream
  if grep -q "createUIMessageStream" "$file_path" && ! grep -q "consumeStream" "$file_path"; then
    violations+="⚠️  createUIMessageStream requires result.consumeStream() before toUIMessageStream()\n"
  fi

  if [ -n "$violations" ]; then
    echo -e "\n🚨 AI SDK v5 Compatibility Issues in $file_path:" >&2
    echo -e "$violations" >&2
    echo -e "Run: pnpm verify:ai-sdk\n" >&2
  fi
fi

exit 0
```

---

### 2. Database Schema Safety

**Problem**: Accidental schema changes can break production
**Solution**: PreToolUse hook protects critical database files

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/protect-db-schema.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Critical database files
protected_files=(
  "lib/db/schema.ts"
  "drizzle.config.ts"
  "lib/supabase/schema.sql"
)

for protected in "${protected_files[@]}"; do
  if [[ "$file_path" == *"$protected"* ]]; then
    echo "🔒 BLOCKED: $file_path is a critical database file" >&2
    echo "   Database schema changes require manual review and migration." >&2
    echo "   To modify schema:" >&2
    echo "   1. Edit manually with caution" >&2
    echo "   2. Run: pnpm db:generate" >&2
    echo "   3. Review migration SQL" >&2
    echo "   4. Run: pnpm db:migrate" >&2
    exit 2
  fi
done

exit 0
```

---

### 3. Auto-Format with pnpm

**Problem**: Code style consistency across TypeScript/React files
**Solution**: PostToolUse hook runs ESLint auto-fix

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/auto-format.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only TypeScript/React files
if [[ "$file_path" =~ \.(ts|tsx|js|jsx)$ ]]; then
  # Run ESLint auto-fix
  pnpm eslint --fix "$file_path" 2>/dev/null

  # Note: prettier is handled by ESLint config
  exit 0
fi

exit 0
```

---

### 4. Type Checking After Edits

**Problem**: TypeScript errors not caught until build
**Solution**: PostToolUse hook runs type check on edited files

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/type-check-file.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

if [[ "$file_path" =~ \.(ts|tsx)$ ]]; then
  echo "🔍 Type checking: $file_path" >&2

  # Run incremental type check
  pnpm tsc --noEmit "$file_path" 2>&1 | head -30 >&2

  if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "⚠️  Type errors detected. Run 'pnpm type-check' for details." >&2
  fi
fi

exit 0
```

---

### 5. Prevent npm/yarn Usage

**Problem**: Codebase requires pnpm@9.12.3, but npm/yarn might be used accidentally
**Solution**: PreToolUse hook blocks non-pnpm package managers

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/enforce-pnpm.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
command=$(echo "$tool_input" | jq -r '.command // empty')

# Check for npm or yarn usage
if echo "$command" | grep -qE '^(npm|yarn)\s'; then
  echo "🚫 BLOCKED: This project uses pnpm@9.12.3 exclusively" >&2
  echo "   Replace with: ${command//npm/pnpm}" >&2
  echo "   Replace with: ${command//yarn/pnpm}" >&2
  exit 2
fi

exit 0
```

---

### 6. Supabase Migration Safety

**Problem**: Direct database changes bypass migration system
**Solution**: Warn when Supabase SQL tools are used

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__supabase-community-supabase-mcp__execute_sql",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/supabase-migration-warning.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

echo "⚠️  Direct SQL execution detected" >&2
echo "   Consider creating a migration instead:" >&2
echo "   1. Create file: lib/db/migrations/XXXX_description.sql" >&2
echo "   2. Write SQL in migration file" >&2
echo "   3. Run: pnpm db:migrate" >&2
echo "" >&2
echo "   Proceeding with direct execution..." >&2

exit 0  # Warn but don't block
```

---

### 7. Build Verification Before Git Push

**Problem**: Pushing broken code to CI/CD
**Solution**: PreToolUse hook runs build check before git push

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/pre-git-push.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
command=$(echo "$tool_input" | jq -r '.command // empty')

# Only intercept git push commands
if ! echo "$command" | grep -q "git push"; then
  exit 0
fi

echo "🚀 Pre-push verification starting..." >&2

# Type check
echo "  1/3 Running type check..." >&2
if ! pnpm tsc --noEmit 2>&1 | head -20 >&2; then
  echo "❌ Type check failed. Fix errors before pushing." >&2
  exit 2
fi

# Lint
echo "  2/3 Running linter..." >&2
if ! pnpm lint 2>&1 | head -20 >&2; then
  echo "❌ Lint failed. Run 'pnpm lint:fix' and try again." >&2
  exit 2
fi

# Build (with timeout)
echo "  3/3 Running build..." >&2
if ! timeout 300 pnpm build 2>&1 | tail -50 >&2; then
  echo "❌ Build failed. Fix build errors before pushing." >&2
  exit 2
fi

echo "✅ Pre-push checks passed. Proceeding with push..." >&2
exit 0
```

---

### 8. Session Context Loading

**Problem**: Losing context about project state between sessions
**Solution**: SessionStart hook displays project status

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

echo "📋 Agentic Assets App - Session Context" >&2
echo "========================================" >&2
echo "" >&2

# Git status
echo "🔀 Git Status:" >&2
git status --short 2>&1 | head -20 >&2
echo "" >&2

# Recent commits
echo "📝 Recent Commits:" >&2
git log --oneline -5 >&2
echo "" >&2

# Current branch
branch=$(git branch --show-current)
echo "🌿 Current Branch: $branch" >&2
echo "" >&2

# Package manager check
echo "📦 Package Manager: pnpm@$(pnpm --version)" >&2
echo "" >&2

# Node version
echo "🟢 Node Version: $(node --version)" >&2
echo "" >&2

# Key project info from CLAUDE.md
echo "🎯 Key Reminders:" >&2
echo "   • Use pnpm (NOT npm/yarn)" >&2
echo "   • AI SDK 5 ONLY (maxOutputTokens, inputSchema, ModelMessage)" >&2
echo "   • Run 'pnpm verify:ai-sdk' after AI changes" >&2
echo "   • Type check: pnpm tsc --noEmit" >&2
echo "   • Build before push: pnpm build" >&2
echo "" >&2

# Check for uncommitted AI SDK changes
if git diff --name-only | grep -qE '(lib/ai|app/.*chat)'; then
  echo "⚠️  Uncommitted AI SDK changes detected" >&2
  echo "   Run 'pnpm verify:ai-sdk' before committing" >&2
  echo "" >&2
fi

exit 0
```

---

### 9. Prevent Hardcoded Tailwind Text Classes

**Problem**: Tailwind text size classes should use CSS variables with clamp()
**Solution**: PostToolUse hook warns about hardcoded text classes

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/check-tailwind-text.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only check component files
if [[ "$file_path" =~ \.(tsx|jsx)$ ]]; then
  # Look for hardcoded Tailwind text classes
  if grep -qE 'className="[^"]*text-(xs|sm|base|lg|xl|2xl|3xl|4xl)' "$file_path"; then
    echo "⚠️  Hardcoded Tailwind text classes detected in $file_path" >&2
    echo "   Per CLAUDE.md: Use CSS variables with clamp() for responsive sizing" >&2
    echo "   Example: style={{fontSize: 'clamp(1rem, 2vw, 1.5rem)'}} or CSS var" >&2
    echo "" >&2
    grep -n 'text-\(xs\|sm\|base\|lg\|xl\|2xl\|3xl\|4xl\)' "$file_path" | head -5 >&2
  fi
fi

exit 0
```

---

### 10. Streaming Pattern Validation

**Problem**: Forgetting `result.consumeStream()` before `toUIMessageStream()`
**Solution**: PostToolUse validates streaming patterns

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/validate-streaming.sh"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only check API route files
if [[ "$file_path" =~ app.*api.*chat.*route\.(ts|tsx)$ ]]; then
  if [ -f "$file_path" ]; then
    # Check for createUIMessageStream without consumeStream
    if grep -q "createUIMessageStream" "$file_path"; then
      if ! grep -q "consumeStream" "$file_path"; then
        echo "❌ Missing consumeStream() in $file_path" >&2
        echo "   AI SDK 5 requires: result.consumeStream() before result.toUIMessageStream()" >&2
        exit 0  # Warn but don't block
      fi
    fi

    # Check for deprecated streaming patterns
    if grep -q "streamText" "$file_path" && ! grep -q "createUIMessageStream" "$file_path"; then
      echo "⚠️  Consider using createUIMessageStream instead of streamText for chat routes" >&2
    fi
  fi
fi

exit 0
```

---

## Recommended Hook Combinations

### Minimal Setup (Start Here)
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

### Quality Assurance Setup
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {"type": "command", "command": ".claude/hooks/auto-format.sh"},
          {"type": "command", "command": ".claude/hooks/validate-ai-sdk-v5.sh"},
          {"type": "command", "command": ".claude/hooks/type-check-file.sh"}
        ]
      }
    ]
  }
}
```

### Security-Focused Setup
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

### Comprehensive Setup (All Hooks)
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command", "command": ".claude/hooks/session-start.sh"}]
    }],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{"type": "command", "command": ".claude/hooks/protect-db-schema.sh"}]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {"type": "command", "command": ".claude/hooks/enforce-pnpm.sh"},
          {"type": "command", "command": ".claude/hooks/pre-git-push.sh"}
        ]
      },
      {
        "matcher": "mcp__supabase-community-supabase-mcp__execute_sql",
        "hooks": [{"type": "command", "command": ".claude/hooks/supabase-migration-warning.sh"}]
      }
    ],
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [
        {"type": "command", "command": ".claude/hooks/auto-format.sh"},
        {"type": "command", "command": ".claude/hooks/validate-ai-sdk-v5.sh"},
        {"type": "command", "command": ".claude/hooks/validate-streaming.sh"},
        {"type": "command", "command": ".claude/hooks/check-tailwind-text.sh"}
      ]
    }]
  }
}
```

---

## Workflow-Specific Strategies

### 1. TDD Workflow
Enable test automation after code changes:
```bash
# .claude/hooks/auto-test.sh
#!/bin/bash
tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

if [[ "$file_path" =~ \.(ts|tsx)$ ]] && [[ ! "$file_path" =~ \.test\. ]]; then
  pnpm test --related "$file_path" --silent 2>&1 | head -30 >&2
fi
exit 0
```

### 2. Documentation-First Workflow
Auto-update documentation when code changes:
```bash
# .claude/hooks/update-docs.sh
#!/bin/bash
tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# If AI tool changed, remind to update docs
if [[ "$file_path" =~ lib/ai/tools/ ]]; then
  echo "📚 Reminder: Update CLAUDE.md and TOOL-CHECKLIST.md if tool API changed" >&2
fi
exit 0
```

### 3. Pair Programming Mode
Log all changes for review:
```bash
# .claude/hooks/pair-log.sh
#!/bin/bash
mkdir -p .claude/logs
echo "[$(date)] Tool: $CLAUDE_TOOL_NAME" >> .claude/logs/pair-session.log
cat >> .claude/logs/pair-session.log
exit 0
```

---

## Performance Optimization

### Hook Execution Time Budget
- **PreToolUse**: < 100ms (blocks tool execution)
- **PostToolUse**: < 2s (delays next operation)
- **SessionStart**: < 5s (one-time cost)

### Optimization Techniques

**1. Conditional Execution**:
```bash
# Only run expensive operations on relevant files
if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
  exit 0  # Fast path for non-TS files
fi
```

**2. Parallel Execution**:
```bash
# Run multiple checks in parallel
(.claude/hooks/check-lint.sh &)
(.claude/hooks/check-types.sh &)
wait
```

**3. Caching**:
```bash
# Cache type check results
cache_key=$(md5sum "$file_path" | cut -d' ' -f1)
if [ -f "/tmp/typecheck-$cache_key" ]; then
  exit 0  # Already checked this version
fi
pnpm tsc --noEmit "$file_path"
touch "/tmp/typecheck-$cache_key"
```

---

## Troubleshooting

### Hook Not Running
1. Check file permissions: `chmod +x .claude/hooks/*.sh`
2. Verify JSON syntax: `jq . .claude/settings.local.json`
3. Check matcher pattern matches tool name exactly

### Hook Blocking Unexpectedly
1. Review exit code (should be 0 for success, 2 for block)
2. Check stderr output for error messages
3. Test hook independently: `echo '{}' | .claude/hooks/your-hook.sh`

### Performance Issues
1. Add timing: `time .claude/hooks/your-hook.sh`
2. Move slow operations to PostToolUse or background
3. Add conditional checks to skip unnecessary work

---

## Next Steps

1. Create `.claude/hooks/` directory
2. Copy relevant scripts from **hooks-examples.md**
3. Start with minimal setup (SessionStart + enforce-pnpm)
4. Add quality assurance hooks as needed
5. Test thoroughly in `.claude/settings.local.json` before committing

---

**Last Updated**: January 2025
**Project**: Agentic Assets App
**Compatibility**: Claude Code v2.0.10+
