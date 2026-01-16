# Claude Code Web Setup Guide

## Overview

This guide configures the Agentic Assets App for Claude Code on the web (https://code.claude.com/), which runs in a Linux container environment instead of your local Windows machine.

## Key Differences: Local vs Web

| Aspect | Local (Windows) | Web (Linux) |
|--------|----------------|-------------|
| **OS** | Windows 11 | Linux container |
| **Shell** | PowerShell/bash | bash only |
| **Environment** | Local filesystem | Remote container |
| **MCP Servers** | Can use localhost | Must use remote URLs |
| **Dependencies** | Pre-installed | Install per session |
| **Hooks** | Can use PowerShell | bash only |

## Configuration Files

### 1. settings.json (Current - Windows Optimized)

Located at `.claude/settings.json`
- **Purpose**: Optimized for local Windows development in Cursor IDE
- **Features**: PowerShell wrappers, Windows paths, local MCP servers
- **Used by**: Cursor IDE on Windows

### 2. settings.web.json (New - Web Optimized)

Located at `.claude/settings.web.json`
- **Purpose**: Optimized for Claude Code web environment
- **Features**: Direct bash hooks, cross-platform paths, remote MCP servers only
- **Used by**: Claude Code on the web

**To use this configuration:**
```bash
# Rename settings.json to settings.local.json (backup)
mv .claude/settings.json .claude/settings.local.json

# Copy web settings to main settings file
cp .claude/settings.web.json .claude/settings.json
```

### 3. MCP Server Configuration

The project has two MCP configuration files:

#### .mcp.json (Project-Level - Web Compatible)
```json
{
  "mcpServers": {
    "next-devtools": { "command": "npx", "args": ["-y", "next-devtools-mcp@latest"] },
    "shadcn": { "command": "npx", "args": ["shadcn@latest", "mcp"] },
    "orbis": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.phdai.ai/api/mcp/universal",
        "--header",
        "Authorization: Bearer orbis_mcp_H87XFReOGgfPw53D1_NT7bRKr2DV07lZIV39JMqcJAJLK1wh"
      ]
    }
  }
}
```

**Status**: ✅ This file is web-compatible and will be used automatically.

#### .cursor/mcp.json (Cursor IDE Only)
Contains additional MCP servers including:
- Supabase (with access token)
- GitHub (via Smithery)
- Exa search
- Vercel
- Render
- Local Orbis (localhost - won't work in web)

**Status**: ⚠️ Only used by Cursor IDE, not Claude Code web

## Hooks Setup

### SessionStart Hook

Located at `.claude/hooks/session-start.sh`

**What it does**:
1. Detects if running in Claude Code web (`CLAUDE_CODE_REMOTE=true`)
2. Checks for pnpm availability
3. Installs dependencies if `node_modules` missing
4. Displays helpful commands

**Status**: ✅ Already configured for web environment

### Auto-Inject Begin Hook

Located at `.claude/hooks/auto-inject-begin.sh`

**What it does**:
- Runs after **every user message** (UserPromptSubmit)
- Auto-injects orchestrator instructions from `.claude/commands/begin.md`
- Reminds Claude to delegate to specialized subagents
- Encourages parallel/sequential agent coordination

**Status**: ✅ Enabled in web settings

**To disable**: See `.claude/hooks/AUTO_INJECT_GUIDE.md` for options

### Security Validation Hook

Located at `.claude/hooks/validate-bash-security.sh`

**What it does**:
- Blocks dangerous bash commands (rm -rf /, etc.)
- Validates command safety before execution
- Returns exit code 2 to block unsafe commands

**Status**: ✅ Cross-platform compatible

### Auto-Format Hook

Located at `.claude/hooks/auto-format.sh`

**What it does**:
- Runs after Edit/Write operations
- Formats TypeScript/JavaScript files
- Uses project's ESLint configuration

**Status**: ✅ Enabled (requires pnpm + dependencies installed)

## Environment Variables

Claude Code web automatically sets:
- `CLAUDE_CODE_REMOTE=true` - Detects web environment
- `CLAUDE_PROJECT_DIR` - Project root directory path

## Dependency Management

### Automatic Installation

The SessionStart hook automatically runs:
```bash
pnpm install --frozen-lockfile
```

This happens:
- ✅ Only in Claude Code web (not local)
- ✅ Only if `node_modules` is missing
- ✅ Uses frozen lockfile for reproducibility

### Manual Installation

If you need to reinstall dependencies:
```bash
rm -rf node_modules
# Then restart the session or run:
pnpm install
```

## Available MCP Tools

When properly configured, these MCP tools will be available:

### Orbis MCP (Remote)
- `mcp__orbis__search_papers` - Search academic papers
- `mcp__orbis__get_paper_details` - Get paper details
- `mcp__orbis__analyze_document` - Analyze PDF documents
- `mcp__orbis__create_document` - Create documents
- `mcp__orbis__update_document` - Update documents
- `mcp__orbis__literature_search` - Comprehensive lit search
- `mcp__orbis__fred_search` - Search FRED economic data
- `mcp__orbis__fred_series_batch` - Fetch multiple FRED series
- `mcp__orbis__get_weather` - Get weather data
- `mcp__orbis__internet_search` - Web search via Perplexity
- `mcp__orbis__export_citations` - Export citations

### shadcn MCP
- `mcp__shadcn__get_project_registries` - Get configured registries
- `mcp__shadcn__search_items_in_registries` - Search components
- `mcp__shadcn__view_items_in_registries` - View component details
- `mcp__shadcn__get_item_examples_from_registries` - Get usage examples
- `mcp__shadcn__get_add_command_for_items` - Get CLI add command

### Next.js Devtools MCP
- Next.js-specific debugging and development tools

## Testing the Setup

### 1. Check Environment Detection
```bash
echo $CLAUDE_CODE_REMOTE
# Should output: true
```

### 2. Verify pnpm is Available
```bash
pnpm --version
# Should output: 10.26.1 or similar
```

### 3. Check Dependencies
```bash
ls -la node_modules
# Should show installed packages
```

### 4. Test MCP Tools
Try using an MCP tool:
```
Please search for papers on "machine learning"
```

This should invoke `mcp__orbis__search_papers` if configured correctly.

### 5. Verify Hooks
Edit a TypeScript file and check if auto-formatting runs.

## Troubleshooting

### MCP Tools Not Available

**Problem**: MCP tools showing as unavailable

**Solutions**:
1. Check that `.mcp.json` exists in project root
2. Verify `settings.json` has `"enableAllProjectMcpServers": true`
3. Restart the Claude Code web session
4. Check network connectivity for remote MCP servers

### Dependencies Not Installing

**Problem**: `pnpm install` failing or not running

**Solutions**:
1. Check that pnpm is available: `which pnpm`
2. Manually run: `pnpm install --frozen-lockfile`
3. Check for network issues
4. Verify `pnpm-lock.yaml` exists

### Hooks Not Running

**Problem**: Hooks not executing after tool use

**Solutions**:
1. Verify hook scripts are executable: `ls -la .claude/hooks/*.sh`
2. Make executable: `chmod +x .claude/hooks/*.sh`
3. Check hook script errors: Run manually to see output
4. Verify `settings.json` hook paths use `$CLAUDE_PROJECT_DIR`

### PowerShell Errors

**Problem**: Seeing PowerShell-related errors

**Solution**: You're using the wrong `settings.json`. Switch to web version:
```bash
mv .claude/settings.json .claude/settings.windows.json
cp .claude/settings.web.json .claude/settings.json
```

## Best Practices

### 1. Use Remote MCP Servers Only
- ✅ Remote URLs: `https://www.phdai.ai/api/mcp/universal`
- ❌ Localhost URLs: `http://localhost:3000/api/mcp`

### 2. Keep Hooks Simple
- ✅ Direct bash commands
- ❌ PowerShell wrappers or complex shell scripts

### 3. Test in Web Environment
- Always test configuration changes in actual Claude Code web session
- Don't assume local behavior matches web behavior

### 4. Use Environment Detection
```bash
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  # Web-specific logic
else
  # Local-specific logic
fi
```

### 5. Handle Missing Dependencies Gracefully
```bash
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found; skipping"
  exit 0
fi
```

## Quick Start Checklist

- [ ] Backup current settings: `cp .claude/settings.json .claude/settings.local.json`
- [ ] Activate web settings: `cp .claude/settings.web.json .claude/settings.json`
- [ ] Verify `.mcp.json` exists and contains remote servers only
- [ ] Make hooks executable: `chmod +x .claude/hooks/*.sh`
- [ ] Start Claude Code web session
- [ ] Verify `CLAUDE_CODE_REMOTE=true`
- [ ] Check dependencies install automatically
- [ ] Test MCP tool (e.g., search papers)
- [ ] Edit a file to test hooks

## Migration Path

### From Local (Windows) to Web

```bash
# 1. Backup local configuration
cp .claude/settings.json .claude/settings.local.json

# 2. Activate web configuration
cp .claude/settings.web.json .claude/settings.json

# 3. Commit changes
git add .claude/settings.json .claude/settings.web.json
git commit -m "Add Claude Code web configuration"
git push
```

### From Web back to Local

```bash
# Restore local settings
cp .claude/settings.local.json .claude/settings.json
```

## Additional Resources

- [Claude Code Web Docs](https://code.claude.com/docs/en/claude-code-on-the-web)
- [MCP Protocol Docs](https://modelcontextprotocol.io/)
- [Project CLAUDE.md](../CLAUDE.md) - Main project instructions

## Support

If you encounter issues:

1. Check this guide first
2. Review hook script output for errors
3. Verify environment variables are set correctly
4. Test MCP servers independently
5. Check project logs for detailed error messages

---

*Last Updated: January 6, 2026*
