# Claude Code Hooks: Practical Examples & Templates

## Quick Start: Copy-Paste Examples

This guide provides production-ready hook scripts you can copy directly into your `.claude/hooks/` directory.

---

## Setup Instructions

```bash
# 1. Create hooks directory
mkdir -p .claude/hooks .claude/logs

# 2. Copy scripts from this guide to .claude/hooks/

# 3. Make scripts executable
chmod +x .claude/hooks/*.sh

# 4. Configure in .claude/settings.local.json
```

---

## Example 1: Session Start Dashboard

**File**: `.claude/hooks/session-start.sh`

```bash
#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗" >&2
echo "║  Agentic Assets App - AI Chat Application                 ║" >&2
echo "║  Next.js 16 + React 19 + AI SDK 5 + Supabase              ║" >&2
echo "╚════════════════════════════════════════════════════════════╝" >&2
echo "" >&2

# Git status
echo "📍 Current Branch: $(git branch --show-current)" >&2
git_status=$(git status --short 2>&1 | head -10)
if [ -n "$git_status" ]; then
  echo "🔀 Git Status:" >&2
  echo "$git_status" >&2
else
  echo "✨ Working directory clean" >&2
fi
echo "" >&2

# Recent commits
echo "📝 Recent Commits:" >&2
git log --oneline --graph -5 >&2
echo "" >&2

# Versions
echo "🔧 Environment:" >&2
echo "   • pnpm: $(pnpm --version)" >&2
echo "   • node: $(node --version)" >&2
echo "   • TypeScript: v$(pnpm tsc --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" >&2
echo "" >&2

# Quick health check
echo "🏥 Quick Health Check:" >&2

# Check for TypeScript errors (fast, no emit)
type_errors=$(pnpm tsc --noEmit 2>&1 | grep -c "error TS" || echo "0")
if [ "$type_errors" -eq 0 ]; then
  echo "   ✅ No TypeScript errors" >&2
else
  echo "   ⚠️  $type_errors TypeScript error(s) detected" >&2
fi

# Check package.json for correct package manager
if grep -q '"packageManager": "pnpm@9.12.3"' package.json; then
  echo "   ✅ Package manager: pnpm@9.12.3" >&2
else
  echo "   ⚠️  Package manager mismatch" >&2
fi

echo "" >&2

# Key reminders
echo "💡 Key Reminders:" >&2
echo "   • AI SDK 5: maxOutputTokens, inputSchema, ModelMessage" >&2
echo "   • Before commit: pnpm lint:fix && pnpm type-check" >&2
echo "   • Before push: pnpm build" >&2
echo "   • Verify AI changes: pnpm verify:ai-sdk" >&2
echo "" >&2

# Check for uncommitted AI SDK files
uncommitted_ai=$(git diff --name-only | grep -E '(lib/ai|app/.*chat)' | wc -l)
if [ "$uncommitted_ai" -gt 0 ]; then
  echo "⚠️  $uncommitted_ai uncommitted AI SDK file(s)" >&2
  echo "   Run 'pnpm verify:ai-sdk' before committing" >&2
  echo "" >&2
fi

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command", "command": ".claude/hooks/session-start.sh"}]
    }]
  }
}
```

---

## Example 2: Enforce pnpm Package Manager

**File**: `.claude/hooks/enforce-pnpm.sh`

```bash
#!/bin/bash

tool_input=$(cat)
command=$(echo "$tool_input" | jq -r '.command // empty')

# Detect npm usage
if echo "$command" | grep -qE '^\s*npm\s'; then
  echo "🚫 BLOCKED: This project uses pnpm exclusively" >&2
  echo "" >&2
  echo "   ❌ You tried: $command" >&2
  echo "   ✅ Use instead: ${command/npm/pnpm}" >&2
  echo "" >&2
  echo "   Reason: package.json enforces pnpm@9.12.3" >&2
  exit 2
fi

# Detect yarn usage
if echo "$command" | grep -qE '^\s*yarn\s'; then
  echo "🚫 BLOCKED: This project uses pnpm exclusively" >&2
  echo "" >&2
  echo "   ❌ You tried: $command" >&2
  echo "   ✅ Use instead: ${command/yarn/pnpm}" >&2
  echo "" >&2
  echo "   Reason: package.json enforces pnpm@9.12.3" >&2
  exit 2
fi

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{"type": "command", "command": ".claude/hooks/enforce-pnpm.sh"}]
    }]
  }
}
```

---

## Example 3: AI SDK 5 Pattern Validator

**File**: `.claude/hooks/validate-ai-sdk-v5.sh`

```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only check AI-related files
if [[ ! "$file_path" =~ (lib/ai|app/.*/api.*chat) ]]; then
  exit 0
fi

# Skip if file doesn't exist or is empty
if [ ! -f "$file_path" ] || [ ! -s "$file_path" ]; then
  exit 0
fi

violations=""
violation_count=0

# Check 1: maxTokens → maxOutputTokens
if grep -qE '\bmaxTokens\s*:' "$file_path"; then
  violations+="❌ AI SDK v5: Use 'maxOutputTokens' instead of 'maxTokens'\n"
  violations+="   Lines: $(grep -n 'maxTokens\s*:' "$file_path" | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')\n\n"
  ((violation_count++))
fi

# Check 2: parameters → inputSchema
if grep -qE '\bparameters\s*:' "$file_path" | grep -v 'providerOptions'; then
  violations+="❌ AI SDK v5: Use 'inputSchema' (Zod) instead of 'parameters'\n"
  violations+="   Lines: $(grep -n 'parameters\s*:' "$file_path" | grep -v 'providerOptions' | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')\n\n"
  ((violation_count++))
fi

# Check 3: CoreMessage → ModelMessage
if grep -q 'CoreMessage' "$file_path"; then
  violations+="❌ AI SDK v5: Use 'ModelMessage' instead of 'CoreMessage'\n"
  violations+="   Lines: $(grep -n 'CoreMessage' "$file_path" | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')\n\n"
  ((violation_count++))
fi

# Check 4: Missing consumeStream
if grep -q 'createUIMessageStream' "$file_path"; then
  if ! grep -q 'consumeStream' "$file_path"; then
    violations+="⚠️  Missing consumeStream(): Required before toUIMessageStream()\n"
    violations+="   Pattern: result.consumeStream() before result.toUIMessageStream()\n\n"
    ((violation_count++))
  fi
fi

# Check 5: Deprecated content string
if grep -qE 'content\s*:\s*["\x27]' "$file_path" | grep -E '(message|Message)'; then
  violations+="⚠️  Consider using Message_v2 with 'parts' array instead of 'content' string\n\n"
fi

# Report violations
if [ -n "$violations" ]; then
  echo "" >&2
  echo "╔══════════════════════════════════════════════════════════╗" >&2
  echo "║  AI SDK v5 Compatibility Issues Detected                ║" >&2
  echo "╚══════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
  echo "📁 File: $file_path" >&2
  echo "🔢 Issues: $violation_count" >&2
  echo "" >&2
  echo -e "$violations" >&2
  echo "🔧 Recommended Actions:" >&2
  echo "   1. Fix the issues above" >&2
  echo "   2. Run: pnpm verify:ai-sdk" >&2
  echo "   3. Test streaming: pnpm dev" >&2
  echo "" >&2
fi

exit 0  # Warn but don't block
```

**Configuration**:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": ".claude/hooks/validate-ai-sdk-v5.sh"}]
    }]
  }
}
```

---

## Example 4: Auto-Format TypeScript Files

**File**: `.claude/hooks/auto-format.sh`

```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only process TypeScript/JavaScript files
if [[ ! "$file_path" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist
if [ ! -f "$file_path" ]; then
  exit 0
fi

echo "🎨 Auto-formatting: $file_path" >&2

# Run ESLint with auto-fix
if command -v pnpm &> /dev/null; then
  pnpm eslint --fix "$file_path" 2>&1 | grep -E '(error|warning)' | head -10 >&2

  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "   ✅ Formatted successfully" >&2
  else
    echo "   ⚠️  Some issues couldn't be auto-fixed" >&2
  fi
fi

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": ".claude/hooks/auto-format.sh"}]
    }]
  }
}
```

---

## Example 5: Database Schema Protection

**File**: `.claude/hooks/protect-db-schema.sh`

```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# List of protected database files
protected_patterns=(
  "lib/db/schema.ts"
  "drizzle.config.ts"
  "lib/supabase/schema.sql"
  "lib/db/migrations/"
)

for pattern in "${protected_patterns[@]}"; do
  if [[ "$file_path" == *"$pattern"* ]]; then
    echo "╔══════════════════════════════════════════════════════════╗" >&2
    echo "║  🔒 DATABASE SCHEMA PROTECTION                          ║" >&2
    echo "╚══════════════════════════════════════════════════════════╝" >&2
    echo "" >&2
    echo "❌ BLOCKED: Attempting to modify protected database file" >&2
    echo "📁 File: $file_path" >&2
    echo "" >&2
    echo "🚨 Reason: Schema changes require manual review and migration" >&2
    echo "" >&2
    echo "✅ Correct Process:" >&2
    echo "   1. Edit schema file manually with caution" >&2
    echo "   2. Generate migration: pnpm db:generate" >&2
    echo "   3. Review migration SQL carefully" >&2
    echo "   4. Test migration: pnpm db:migrate" >&2
    echo "   5. Verify changes: pnpm db:studio" >&2
    echo "" >&2
    echo "📚 See: lib/db/CLAUDE.md for schema change guidelines" >&2
    echo "" >&2
    exit 2
  fi
done

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": ".claude/hooks/protect-db-schema.sh"}]
    }]
  }
}
```

---

## Example 6: Type Check After Edits

**File**: `.claude/hooks/type-check-file.sh`

```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only TypeScript files
if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist
if [ ! -f "$file_path" ]; then
  exit 0
fi

echo "🔍 Type checking: $file_path" >&2

# Run type check (no emit, fast)
type_output=$(pnpm tsc --noEmit "$file_path" 2>&1)
type_exit=$?

if [ $type_exit -eq 0 ]; then
  echo "   ✅ No type errors" >&2
else
  echo "   ⚠️  Type errors detected:" >&2
  echo "" >&2
  echo "$type_output" | head -20 >&2
  echo "" >&2
  echo "💡 Run 'pnpm type-check' for full analysis" >&2
fi

exit 0  # Don't block, just inform
```

**Configuration**:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": ".claude/hooks/type-check-file.sh"}]
    }]
  }
}
```

---

## Example 7: Pre-Git-Push Build Check

**File**: `.claude/hooks/pre-git-push.sh`

```bash
#!/bin/bash

tool_input=$(cat)
command=$(echo "$tool_input" | jq -r '.command // empty')

# Only intercept git push commands
if ! echo "$command" | grep -qE '^\s*git push'; then
  exit 0
fi

echo "╔══════════════════════════════════════════════════════════╗" >&2
echo "║  🚀 Pre-Push Verification                               ║" >&2
echo "╚══════════════════════════════════════════════════════════╝" >&2
echo "" >&2

# Step 1: Type Check
echo "⏳ [1/3] Running type check..." >&2
type_output=$(pnpm tsc --noEmit 2>&1)
type_exit=$?

if [ $type_exit -eq 0 ]; then
  echo "   ✅ Type check passed" >&2
else
  echo "   ❌ Type check failed:" >&2
  echo "$type_output" | head -20 >&2
  echo "" >&2
  echo "🔧 Fix type errors before pushing" >&2
  exit 2
fi

# Step 2: Lint
echo "⏳ [2/3] Running linter..." >&2
lint_output=$(pnpm lint 2>&1)
lint_exit=$?

if [ $lint_exit -eq 0 ]; then
  echo "   ✅ Lint check passed" >&2
else
  echo "   ❌ Lint check failed:" >&2
  echo "$lint_output" | head -20 >&2
  echo "" >&2
  echo "🔧 Run 'pnpm lint:fix' and try again" >&2
  exit 2
fi

# Step 3: Build (with timeout)
echo "⏳ [3/3] Running build (max 5 min)..." >&2
build_output=$(timeout 300 pnpm build 2>&1)
build_exit=$?

if [ $build_exit -eq 0 ]; then
  echo "   ✅ Build successful" >&2
elif [ $build_exit -eq 124 ]; then
  echo "   ⏱️  Build timeout (>5 min)" >&2
  echo "   ⚠️  Proceeding anyway, but investigate performance issues" >&2
else
  echo "   ❌ Build failed:" >&2
  echo "$build_output" | tail -30 >&2
  echo "" >&2
  echo "🔧 Fix build errors before pushing" >&2
  exit 2
fi

echo "" >&2
echo "✅ All pre-push checks passed! Proceeding with push..." >&2
echo "" >&2

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{"type": "command", "command": ".claude/hooks/pre-git-push.sh"}]
    }]
  }
}
```

---

## Example 8: Bash Security Validator

**File**: `.claude/hooks/validate-bash-security.sh`

```bash
#!/bin/bash

tool_input=$(cat)
command=$(echo "$tool_input" | jq -r '.command // empty')

# Dangerous command patterns
dangerous_patterns=(
  'rm\s+-rf\s+/'               # Root deletion
  'sudo\s+rm'                  # Privileged deletion
  'chmod\s+777'                # Insecure permissions
  'dd\s+if='                   # Disk operations
  '>\s*/dev/sd[a-z]'           # Disk writes
  'mkfs\.'                     # Format disk
  ':(){:|:&};:'                # Fork bomb
  'curl.*\|\s*bash'            # Pipe to bash
  'wget.*\|\s*sh'              # Pipe to shell
)

# Check each pattern
for pattern in "${dangerous_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "╔══════════════════════════════════════════════════════════╗" >&2
    echo "║  🚨 SECURITY ALERT: Dangerous Command Blocked           ║" >&2
    echo "╚══════════════════════════════════════════════════════════╝" >&2
    echo "" >&2
    echo "❌ BLOCKED: Dangerous command pattern detected" >&2
    echo "📋 Pattern: $pattern" >&2
    echo "💻 Command: $command" >&2
    echo "" >&2
    echo "🛡️  This command could cause system damage" >&2
    echo "" >&2
    echo "If you need to run this command:" >&2
    echo "   1. Review the command carefully" >&2
    echo "   2. Run it manually in your terminal" >&2
    echo "   3. Consider adding to .claude/settings.local.json allowlist" >&2
    echo "" >&2
    exit 2
  fi
done

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{"type": "command", "command": ".claude/hooks/validate-bash-security.sh"}]
    }]
  }
}
```

---

## Example 9: Supabase Migration Warning

**File**: `.claude/hooks/supabase-migration-warning.sh`

```bash
#!/bin/bash

echo "╔══════════════════════════════════════════════════════════╗" >&2
echo "║  ⚠️  Direct SQL Execution Detected                      ║" >&2
echo "╚══════════════════════════════════════════════════════════╝" >&2
echo "" >&2
echo "📊 You're about to execute SQL directly on Supabase" >&2
echo "" >&2
echo "💡 Best Practice: Use migrations instead" >&2
echo "" >&2
echo "✅ Recommended Approach:" >&2
echo "   1. Create migration: touch lib/db/migrations/$(date +%Y%m%d%H%M%S)_description.sql" >&2
echo "   2. Write SQL in migration file" >&2
echo "   3. Run migration: pnpm db:migrate" >&2
echo "   4. Version control: git add lib/db/migrations/" >&2
echo "" >&2
echo "🔄 Migrations provide:" >&2
echo "   • Version control for schema changes" >&2
echo "   • Rollback capability" >&2
echo "   • Reproducible deployments" >&2
echo "   • Team collaboration" >&2
echo "" >&2
echo "⏳ Proceeding with direct execution..." >&2
echo "" >&2

exit 0  # Warn but allow
```

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "mcp__supabase-community-supabase-mcp__execute_sql",
      "hooks": [{"type": "command", "command": ".claude/hooks/supabase-migration-warning.sh"}]
    }]
  }
}
```

---

## Example 10: Tool Usage Logger

**File**: `.claude/hooks/log-tool-usage.sh`

```bash
#!/bin/bash

mkdir -p .claude/logs

tool_input=$(cat)
log_file=".claude/logs/tools-$(date +%Y-%m-%d).jsonl"

# Create structured log entry
log_entry=$(jq -n \
  --arg timestamp "$(date -Iseconds)" \
  --arg tool "$CLAUDE_TOOL_NAME" \
  --arg event "${CLAUDE_HOOK_EVENT:-unknown}" \
  --argjson input "$tool_input" \
  '{
    timestamp: $timestamp,
    tool: $tool,
    event: $event,
    input: $input
  }')

# Append to daily log
echo "$log_entry" >> "$log_file"

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{"type": "command", "command": ".claude/hooks/log-tool-usage.sh"}]
    }]
  }
}
```

---

## Example 11: Desktop Notifications

**File**: `.claude/hooks/desktop-notify.sh`

```bash
#!/bin/bash

# macOS notification
if command -v osascript &> /dev/null; then
  osascript -e 'display notification "Claude Code is awaiting your input" with title "Claude Code"'
fi

# Linux notification
if command -v notify-send &> /dev/null; then
  notify-send "Claude Code" "Awaiting your input" --urgency=normal --icon=dialog-information
fi

# Windows notification (WSL)
if command -v powershell.exe &> /dev/null; then
  powershell.exe -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Claude Code is awaiting your input', 'Claude Code')"
fi

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "Notification": [{
      "hooks": [{"type": "command", "command": ".claude/hooks/desktop-notify.sh"}]
    }]
  }
}
```

---

## Example 12: Streaming Pattern Validator

**File**: `.claude/hooks/validate-streaming.sh`

```bash
#!/bin/bash

tool_input=$(cat)
file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

# Only check API route files
if [[ ! "$file_path" =~ app.*api.*route\.(ts|tsx)$ ]]; then
  exit 0
fi

if [ ! -f "$file_path" ]; then
  exit 0
fi

violations=""

# Check 1: createUIMessageStream without consumeStream
if grep -q 'createUIMessageStream' "$file_path"; then
  if ! grep -q 'consumeStream' "$file_path"; then
    violations+="❌ Missing consumeStream() call\n"
    violations+="   Required: result.consumeStream() before result.toUIMessageStream()\n\n"
  fi
fi

# Check 2: streamText without createUIMessageStream in chat routes
if echo "$file_path" | grep -q 'chat' && grep -q 'streamText' "$file_path"; then
  if ! grep -q 'createUIMessageStream' "$file_path"; then
    violations+="⚠️  Consider using createUIMessageStream for chat routes\n"
    violations+="   Better UX: handles UI state and streaming automatically\n\n"
  fi
fi

# Report violations
if [ -n "$violations" ]; then
  echo "" >&2
  echo "🌊 Streaming Pattern Issues in $file_path:" >&2
  echo -e "$violations" >&2
fi

exit 0
```

**Configuration**:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": ".claude/hooks/validate-streaming.sh"}]
    }]
  }
}
```

---

## Complete Settings.json Template

**File**: `.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [],
    "deny": [],
    "defaultMode": "acceptEdits"
  },
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
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/protect-db-schema.sh"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/enforce-pnpm.sh"
          },
          {
            "type": "command",
            "command": ".claude/hooks/validate-bash-security.sh"
          },
          {
            "type": "command",
            "command": ".claude/hooks/pre-git-push.sh"
          }
        ]
      },
      {
        "matcher": "mcp__supabase-community-supabase-mcp__execute_sql",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/supabase-migration-warning.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/auto-format.sh"
          },
          {
            "type": "command",
            "command": ".claude/hooks/validate-ai-sdk-v5.sh"
          },
          {
            "type": "command",
            "command": ".claude/hooks/validate-streaming.sh"
          },
          {
            "type": "command",
            "command": ".claude/hooks/type-check-file.sh"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/desktop-notify.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Quick Setup Script

**File**: `setup-hooks.sh`

```bash
#!/bin/bash

echo "🚀 Setting up Claude Code hooks..."

# Create directories
mkdir -p .claude/hooks .claude/logs

# Download hook scripts (or copy from this guide)
echo "📝 Copy hook scripts to .claude/hooks/"
echo "   See hooks-examples.md for all scripts"

# Make scripts executable
chmod +x .claude/hooks/*.sh

# Create settings.local.json if it doesn't exist
if [ ! -f .claude/settings.local.json ]; then
  echo "📄 Creating .claude/settings.local.json..."
  cat > .claude/settings.local.json <<'EOF'
{
  "permissions": {
    "defaultMode": "acceptEdits"
  },
  "hooks": {
    "SessionStart": [{
      "hooks": [{"type": "command", "command": ".claude/hooks/session-start.sh"}]
    }]
  }
}
EOF
fi

# Add to .gitignore
if ! grep -q '.claude/settings.local.json' .gitignore; then
  echo ".claude/settings.local.json" >> .gitignore
  echo "✅ Added .claude/settings.local.json to .gitignore"
fi

if ! grep -q '.claude/logs/' .gitignore; then
  echo ".claude/logs/" >> .gitignore
  echo "✅ Added .claude/logs/ to .gitignore"
fi

echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy hook scripts from hooks-examples.md to .claude/hooks/"
echo "  2. Test: .claude/hooks/session-start.sh"
echo "  3. Customize .claude/settings.local.json as needed"
echo "  4. Read hooks-best-practices.md for more info"
```

---

## Testing Your Hooks

### Test Individual Hook
```bash
# Test with mock input
echo '{"file_path": "test.ts"}' | .claude/hooks/your-hook.sh
echo "Exit code: $?"
```

### Test Exit Codes
```bash
# Should exit 0 (allow)
echo '{"file_path": "src/app.ts"}' | .claude/hooks/protect-db-schema.sh

# Should exit 2 (block)
echo '{"file_path": "lib/db/schema.ts"}' | .claude/hooks/protect-db-schema.sh
```

### Test Performance
```bash
# Measure execution time
time echo '{"file_path": "test.ts"}' | .claude/hooks/your-hook.sh
```

---

## Troubleshooting

### Hook Not Executing
```bash
# Check permissions
ls -la .claude/hooks/

# Make executable
chmod +x .claude/hooks/*.sh

# Test directly
.claude/hooks/session-start.sh
```

### JSON Parsing Errors
```bash
# Validate JSON syntax
jq . .claude/settings.local.json

# Check for trailing commas
```

### Environment Variables Not Available
```bash
# Debug what's available
env | grep CLAUDE
```

---

## Next Steps

1. **Create hooks directory**: `mkdir -p .claude/hooks .claude/logs`
2. **Copy relevant scripts** from examples above
3. **Make executable**: `chmod +x .claude/hooks/*.sh`
4. **Configure** `.claude/settings.local.json`
5. **Test** each hook individually before using
6. **Iterate** based on your workflow needs

---

**Last Updated**: January 2025
**Project**: Agentic Assets App
**Compatibility**: Claude Code v2.0.10+
