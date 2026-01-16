# Environment Variables Setup for Claude Code Web

## Overview

Some MCP servers (like Supabase) require environment variables to be set. In Claude Code web, environment variables need to be available in the bash shell session.

## Current Requirements

### SUPABASE_ACCESS_TOKEN

The Supabase MCP server requires a personal access token. You can get this from:
1. Go to https://supabase.com/dashboard/account/tokens
2. Create a new access token
3. Copy the token value

## Setting Environment Variables

### Option 1: Session-Start Hook (Recommended)

Add environment variable exports to `.claude/hooks/session-start.sh`:

```bash
# At the top of session-start.sh, after the CLAUDE_CODE_REMOTE check:
export SUPABASE_ACCESS_TOKEN="your_token_here"
```

**Pros**:
- ✅ Automatic setup on every session
- ✅ Version controlled (if you don't commit the actual token)
- ✅ Works consistently

**Cons**:
- ❌ Token visible in file (use .env approach below instead)

### Option 2: .env File (More Secure)

Create a `.env` file in project root (already in .gitignore):

```bash
# .env
SUPABASE_ACCESS_TOKEN=your_actual_token_here
```

Then load it in session-start hook:

```bash
# In session-start.sh
if [ -f ".env" ]; then
  echo "📝 Loading environment variables from .env..."
  export $(grep -v '^#' .env | xargs)
fi
```

**Pros**:
- ✅ Token not in version control (.env is gitignored)
- ✅ Easy to manage multiple secrets
- ✅ Standard practice

**Cons**:
- ❌ Need to create .env file in each environment

### Option 3: Claude Code Web Settings (If Available)

Check if Claude Code web has environment variable settings in its UI:
1. Look for Settings > Environment Variables
2. Add `SUPABASE_ACCESS_TOKEN` with your token

**Note**: This depends on Claude Code web supporting environment variable configuration.

### Option 4: Manual Export Per Session

Export the variable manually after starting a session:

```bash
export SUPABASE_ACCESS_TOKEN="your_token_here"
```

**Pros**:
- ✅ Quick for testing
- ✅ No file changes needed

**Cons**:
- ❌ Must do every session
- ❌ Easy to forget

## Recommended Setup

For production use, I recommend **Option 2** (.env file):

1. Create `.env` file:
```bash
# .env (not committed to git)
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

2. Update `.claude/hooks/session-start.sh`:
```bash
#!/bin/bash
set -uo pipefail

# Only run this hook in Claude Code web sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "Skipping session start hook (not running in Claude Code web environment)"
  exit 0
fi

echo "🚀 Starting session setup for Agentic Assets App..."
echo ""

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
  echo "📝 Loading environment variables from .env..."
  set -a  # automatically export all variables
  source .env
  set +a
fi

# ... rest of the hook
```

## Verifying Environment Variables

After setting up, verify the variable is available:

```bash
echo $SUPABASE_ACCESS_TOKEN
# Should output: sbp_xxxxx...
```

Or check if it's set without printing the value:

```bash
[ -z "$SUPABASE_ACCESS_TOKEN" ] && echo "NOT SET" || echo "SET"
# Should output: SET
```

## MCP Configuration Syntax

In `.mcp.json`, use `$VARIABLE_NAME` syntax:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase",
        "--project-ref=fhqycqubkkrdgzswccwd"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "$SUPABASE_ACCESS_TOKEN"
      }
    }
  }
}
```

The `$SUPABASE_ACCESS_TOKEN` will be replaced with the actual environment variable value when the MCP server starts.

## Troubleshooting

### MCP Server Fails to Start

**Symptom**: Supabase MCP tools not available

**Check**:
```bash
echo $SUPABASE_ACCESS_TOKEN
# If empty, variable not set
```

**Fix**: Follow Option 2 above to set the variable

### Token Invalid

**Symptom**: MCP server starts but tools fail with auth errors

**Fix**:
1. Verify token is correct at https://supabase.com/dashboard/account/tokens
2. Regenerate token if needed
3. Update .env file
4. Restart session

### .env Not Loading

**Symptom**: Variable not set even with .env file

**Check**:
```bash
ls -la .env
cat .env
```

**Fix**:
1. Ensure .env exists in project root
2. Ensure session-start.sh has the source .env code
3. Check for syntax errors in .env (no spaces around =)

## Security Best Practices

1. **Never commit .env to git** - Already in .gitignore
2. **Use personal access tokens** - Not service account keys
3. **Rotate tokens regularly** - Especially if exposed
4. **Use least privilege** - Token should only have necessary permissions

## Adding More Environment Variables

Follow the same pattern for other secrets:

```bash
# .env
SUPABASE_ACCESS_TOKEN=sbp_xxxxx
OTHER_API_KEY=key_xxxxx
ANOTHER_SECRET=secret_xxxxx
```

Then reference them in MCP configuration:

```json
"env": {
  "OTHER_API_KEY": "$OTHER_API_KEY"
}
```

---

*Environment Setup Guide • Updated: January 6, 2026*
