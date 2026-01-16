# Claude Code Web - Quick Start

## ⚡ 60-Second Setup

```bash
# 1. Activate web configuration
bash .claude/activate-web.sh

# 2. Verify environment
echo $CLAUDE_CODE_REMOTE  # Should output: true

# 3. Test MCP tools
# Ask Claude: "Search for papers on machine learning"
```

## 🎯 Key Differences from Local

| Feature | Local (Windows) | Web (Linux) |
|---------|----------------|-------------|
| **Shell** | PowerShell + bash | bash only |
| **Hooks** | PowerShell wrappers | Direct bash |
| **MCP Servers** | All (.cursor/mcp.json) | Remote only (.mcp.json) |
| **Dependencies** | Pre-installed | Auto-install per session |
| **Localhost** | Works | ❌ Won't work |

## 🔧 Configuration Files

```
.claude/
├── settings.json         ← Active config (switch with activate-*.sh)
├── settings.web.json     ← Web-optimized (bash hooks, remote MCP)
├── settings.local.json   ← Windows backup (PowerShell hooks)
└── hooks/
    ├── session-start.sh         ← Auto pnpm install (web only)
    ├── auto-inject-begin.sh     ← Auto-inject orchestrator context
    ├── validate-bash-security.sh ← Block dangerous commands
    └── auto-format.sh           ← Auto ESLint on Edit/Write
```

### Hooks Behavior

| Hook | Trigger | What It Does | Disable? |
|------|---------|--------------|----------|
| **session-start** | Session start | Install dependencies | Rename hook file |
| **auto-inject-begin** | Every message | Inject orchestrator context | See [guide](.claude/hooks/AUTO_INJECT_GUIDE.md) |
| **validate-bash-security** | Before Bash | Block dangerous commands | Not recommended |
| **auto-format** | After Edit/Write | ESLint auto-fix | Rename hook file |

## 🛠 Available MCP Tools

### Orbis MCP (https://www.phdai.ai)
```javascript
mcp__orbis__search_papers           // Academic paper search
mcp__orbis__literature_search       // Comprehensive lit review
mcp__orbis__fred_search             // Search FRED economic data
mcp__orbis__fred_series_batch       // Fetch multiple series
mcp__orbis__internet_search         // Web search (Perplexity)
mcp__orbis__create_document         // Create research docs
mcp__orbis__analyze_document        // Analyze PDFs
mcp__orbis__export_citations        // Export BibTeX/Markdown
```

### shadcn MCP
```javascript
mcp__shadcn__search_items_in_registries     // Find components
mcp__shadcn__get_item_examples              // Get usage examples
mcp__shadcn__get_add_command_for_items      // Get CLI command
```

### Next.js Devtools MCP
```javascript
// Next.js-specific debugging tools
```

## 🚨 Troubleshooting

### MCP Tools Not Working?
```bash
# Check .mcp.json exists
ls -la .mcp.json

# Verify settings enabled
grep enableAllProjectMcpServers .claude/settings.json
# Should show: "enableAllProjectMcpServers": true

# Restart session and try again
```

### Dependencies Not Installing?
```bash
# Manually install
rm -rf node_modules
pnpm install --frozen-lockfile

# Check pnpm available
which pnpm
pnpm --version
```

### Hooks Not Running?
```bash
# Make executable
chmod +x .claude/hooks/*.sh

# Test manually
bash .claude/hooks/session-start.sh
```

### PowerShell Errors?
```bash
# You're using wrong config - switch to web
bash .claude/activate-web.sh
```

## 📝 Common Commands

```bash
# Linting
pnpm lint
pnpm lint:fix

# Type checking
pnpm type-check
pnpm type-check:watch

# AI SDK verification
pnpm verify:ai-sdk

# Database
pnpm db:migrate
pnpm db:studio

# Testing
pnpm test

# Build (cloud only - don't run locally)
# Use: git push → Vercel build
```

## 🔄 Switch Configurations

```bash
# Activate web (for Claude Code web)
bash .claude/activate-web.sh

# Activate local (for Cursor IDE on Windows)
bash .claude/activate-local.sh
```

## ✅ Verification Checklist

After activation, verify:

- [ ] `echo $CLAUDE_CODE_REMOTE` outputs `true`
- [ ] `pnpm --version` works
- [ ] `ls node_modules` shows packages
- [ ] Ask Claude to search papers (tests Orbis MCP)
- [ ] Edit a .ts file (tests auto-format hook)
- [ ] No PowerShell errors in output

## 📚 Full Documentation

See `.claude/CLAUDE_CODE_WEB_SETUP.md` for:
- Detailed architecture comparison
- Complete hook reference
- Environment variable guide
- Migration strategies
- Advanced troubleshooting

## 🆘 Need Help?

1. Check `CLAUDE_CODE_WEB_SETUP.md`
2. Review hook logs for errors
3. Verify `.mcp.json` has remote URLs only
4. Test in fresh session

---

*Quick Start • Updated: January 6, 2026*
