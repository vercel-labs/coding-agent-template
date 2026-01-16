# Claude Code Context Engineering Guide

## What Is Context Engineering?

Context engineering is the practice of **structuring project information to optimize Claude's understanding and effectiveness**. Effective context engineering:
- Reduces repetitive prompting
- Ensures consistent behavior across sessions
- Establishes coding standards and practices
- Improves code quality and adherence to patterns
- Enables autonomous operation in CI/CD environments

## Core Context Mechanisms

Claude Code provides three primary mechanisms for context engineering:

| Mechanism | Invocation | Persistence | Best For |
|-----------|-----------|-------------|----------|
| **CLAUDE.md** | Automatic (startup) | Persistent | Project standards, guidelines |
| **Hooks** | Event-triggered | Per-session | Automation, validation, guardrails |
| **Slash Commands** | User-invoked | On-demand | Frequent workflows, templates |
| **Skills** | Model-invoked | On-demand | Domain expertise, complex capabilities |

## CLAUDE.md Files

### What Are CLAUDE.md Files?

CLAUDE.md files are **memory files** containing instructions and context that Claude loads at startup. They serve as a persistent knowledge base for project-specific information.

### File Locations and Priority

```
CLAUDE.md                   # Repository root (highest priority)
.claude/CLAUDE.md           # Project configuration directory
~/.claude/CLAUDE.md         # User-level defaults (lowest priority)
```

**Priority Order**: Repository root → `.claude/` → User home

### Recommended Content Structure

#### 1. Project Overview
```markdown
# Project Name

Brief description of what this project does and its architecture.

## Tech Stack
- Framework: Next.js 15
- Database: PostgreSQL + Drizzle ORM
- Styling: Tailwind CSS v4
- AI: Vercel AI SDK 5
```

#### 2. Code Style Guidelines
```markdown
## Code Style

- **Files**: kebab-case (e.g., `user-profile.tsx`)
- **Components**: PascalCase exports
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Styling**: Tailwind utilities only (no custom CSS)
- **Imports**: Absolute paths with `@/` prefix
```

#### 3. Architecture Patterns
```markdown
## Architecture

- **App Router**: Use server components by default, add `'use client'` only when needed
- **Database**: Separate App DB (Drizzle) from Vector DB (Supabase)
- **API Routes**: All chat routes must use streaming with `createUIMessageStream`
- **Auth**: Supabase Auth with middleware protection
```

#### 4. Testing Requirements
```markdown
## Testing

- Unit tests for all utility functions
- Integration tests for API routes
- E2E tests for critical user flows
- Minimum 80% code coverage
- Run `pnpm test` before committing
```

#### 5. Common Pitfalls
```markdown
## ⚠️ Common Mistakes to Avoid

- **NEVER** use AI SDK v4 patterns (`maxTokens`, `CoreMessage`)
- **NEVER** skip streaming for chat routes
- **NEVER** mix App DB and Vector DB connections
- **NEVER** use npm/yarn (pnpm only)
- **ALWAYS** run `tsc --noEmit` before pushing
```

### Best Practices for CLAUDE.md

#### ✅ Do:
- **Keep it concise and focused** (aim for under 2000 lines)
- **Use clear section headers** for easy reference
- **Include specific examples** of preferred patterns
- **Document what NOT to do** (anti-patterns)
- **Link to detailed docs** rather than duplicating
- **Use tables and lists** for scannability
- **Update regularly** as standards evolve

#### ❌ Don't:
- Include verbose explanations (be concise)
- Duplicate information from external docs
- Add tangential or rarely-used information
- Use vague guidelines ("write good code")
- Mix multiple unrelated topics in one section

### Example CLAUDE.md Structure

```markdown
# Project Name

**Description**: Brief 1-2 sentence overview

## 🚨 Critical Rules (Read First)

**RULE 1** - Brief explanation
**RULE 2** - Brief explanation
**RULE 3** - Brief explanation

## Tech Stack

[Bulleted list of technologies]

## Essential Commands

```bash
pnpm dev               # Description
pnpm lint              # Description
pnpm test              # Description
```

## Architecture

### Core Files
- `file/path.ts` - Purpose
- `another/file.tsx` - Purpose

### Key Patterns
- **Pattern Name**: Brief explanation with example

## Code Style

### Files and Naming
- Convention 1
- Convention 2

### Components
- Convention 1
- Convention 2

## Database

### Schema
[Brief overview or link]

### Queries
[Patterns and examples]

## Common Mistakes

**NEVER** do X - Explanation
**ALWAYS** do Y - Explanation

## References

- `@/path/to/DETAILED_DOCS.md` - Topic
- External: https://example.com/docs
```

## Hooks: Automated Context Enforcement

### What Are Hooks?

Hooks are **user-defined shell commands** that execute at specific lifecycle points. They provide **deterministic control** over Claude's behavior, ensuring certain actions always happen rather than relying on LLM decisions.

As the documentation states: *"Hooks run automatically during the agent loop with your current environment's credentials."*

### Available Hook Events

| Event | When It Fires | Use Cases |
|-------|---------------|-----------|
| `SessionStart` | Start of session | Install dependencies, configure environment |
| `SessionEnd` | End of session | Cleanup, logging, notifications |
| `PreToolUse` | Before tool execution | Validation, access control |
| `PostToolUse` | After tool execution | Formatting, logging, verification |
| `PreAgentLoop` | Before agent processes | Rate limiting, preconditions |
| `PostAgentLoop` | After agent completes | Quality checks, notifications |
| `UserPromptSubmit` | User sends message | Input validation, preprocessing |
| `AgentMessage` | Agent responds | Output filtering, compliance |
| `ToolApprovalRequest` | Tool needs approval | Custom approval logic |

### Hook Configuration

Hooks are defined in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/scripts/setup.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "toolName === 'Edit' || toolName === 'Write'",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write \"${args.file_path}\""
          }
        ]
      }
    ]
  }
}
```

### Common Hook Patterns

#### 1. Auto-Formatting (PostToolUse)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "toolName === 'Edit' || toolName === 'Write'",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write \"${args.file_path}\" && eslint --fix \"${args.file_path}\""
          }
        ]
      }
    ]
  }
}
```

#### 2. Dependency Installation (SessionStart)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "if [ ! -d node_modules ]; then pnpm install; fi"
          }
        ]
      }
    ]
  }
}
```

#### 3. Protected Files (PreToolUse)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "toolName === 'Edit' && args.file_path.includes('config/production')",
        "hooks": [
          {
            "type": "block",
            "reason": "Production config files cannot be modified directly. Use environment variables instead."
          }
        ]
      }
    ]
  }
}
```

#### 4. Test Verification (PostToolUse)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "toolName === 'Edit' && args.file_path.endsWith('.ts')",
        "hooks": [
          {
            "type": "command",
            "command": "pnpm test -- ${args.file_path.replace('.ts', '.test.ts')}"
          }
        ]
      }
    ]
  }
}
```

#### 5. Environment Setup (Cloud-Specific)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup && process.env.CLAUDE_CODE_REMOTE",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/scripts/cloud-setup.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Best Practices

#### ✅ Do:
- **Use hooks for deterministic behavior** (formatting, validation)
- **Keep hook commands fast** (< 2 seconds ideally)
- **Provide clear error messages** for blocking hooks
- **Test hooks locally** before committing
- **Use matchers to limit scope** (avoid running on every event)
- **Log hook activity** for debugging

#### ❌ Don't:
- Run long-running processes in hooks (use background tasks)
- Block critical operations unnecessarily
- Assume specific environment (check for tools first)
- Use hooks for LLM-decision tasks (use prompts instead)
- Forget that hooks have full environment credentials

### Security Considerations

⚠️ **Critical**: Hooks run with your environment's credentials

**Security checklist**:
- [ ] Review all hook commands before enabling
- [ ] Restrict file access in PreToolUse hooks
- [ ] Validate input in UserPromptSubmit hooks
- [ ] Avoid exposing secrets in hook output
- [ ] Use read-only operations when possible
- [ ] Test hooks in isolated environment first

## Slash Commands for Context

### What Are Slash Commands?

Slash commands are **user-invoked** Markdown files containing predefined prompts. They provide **explicit control** over frequently-used workflows.

### File Structure

```
.claude/commands/          # Project commands (team-shared)
  ├── review-pr.md
  ├── add-feature.md
  └── api/
      └── create-endpoint.md

~/.claude/commands/        # Personal commands
  └── my-workflow.md
```

### Command File Format

```markdown
---
description: Brief description for SlashCommand tool discovery
allowed-tools: [Read, Edit, Grep]
model: sonnet
argument-hint: <feature-name>
---

# Command Instructions

You will receive arguments as: $ARGUMENTS
Or individually: $1, $2, $3

## Steps
1. Do this
2. Do that
3. Complete task

## File References
Use @file/path.ts to include file contents
```

### Example Commands

#### 1. Code Review Command

```markdown
---
description: Review code for quality, security, and best practices
allowed-tools: [Read, Grep, Glob]
model: sonnet
argument-hint: [file-pattern]
---

# Code Review

Review the following code: $ARGUMENTS

## Review Criteria
- Code quality and readability
- Security vulnerabilities (SQL injection, XSS, etc.)
- Performance issues
- Best practices violations
- Test coverage

## Output Format
Provide structured feedback with:
- File path and line numbers
- Issue severity (Critical/High/Medium/Low)
- Specific recommendations
```

#### 2. Feature Implementation Command

```markdown
---
description: Implement new feature following team standards
allowed-tools: [Read, Edit, Write, Grep, Bash]
model: sonnet
argument-hint: <feature-description>
---

# Feature Implementation

Implement: $ARGUMENTS

## Steps
1. Review @CLAUDE.md for coding standards
2. Check @package.json for available dependencies
3. Implement feature with tests
4. Update documentation
5. Run verification: `pnpm lint && pnpm test`

## Standards
- Follow patterns in @CLAUDE.md
- Add unit tests (min 80% coverage)
- Update README.md if user-facing
```

## Context Optimization Strategies

### 1. Context Budget Management

Claude Code has token limits for context. Optimize with:

```bash
# Use /compact regularly to reduce context
/compact

# Monitor context size
/context

# Clear when starting new topics
/clear
```

**Character limits**:
- Default slash command context: 15,000 characters
- Adjustable via settings

### 2. Modular Documentation

Instead of one massive CLAUDE.md:

```
CLAUDE.md                       # Core rules and overview
.claude/
  ├── ARCHITECTURE.md           # Detailed architecture
  ├── API_PATTERNS.md           # API design patterns
  ├── DATABASE_SCHEMA.md        # Database details
  └── TESTING_GUIDE.md          # Testing practices
```

Reference in CLAUDE.md:
```markdown
## Detailed Documentation
- Architecture: See @.claude/ARCHITECTURE.md
- API Patterns: See @.claude/API_PATTERNS.md
- Database: See @.claude/DATABASE_SCHEMA.md
```

### 3. Progressive Disclosure

Structure information from general to specific:

```markdown
# CLAUDE.md

## Quick Start (Always Read)
[Essential rules and commands]

## Architecture (Load When Needed)
[Detailed patterns]

## Advanced Topics (Rarely Needed)
[Edge cases and special scenarios]
```

### 4. Context Layers

Combine mechanisms for layered context:

```
Layer 1: CLAUDE.md               # Persistent standards
Layer 2: Hooks                   # Automated enforcement
Layer 3: Skills                  # Domain expertise (auto-loaded)
Layer 4: Slash Commands          # Explicit workflows
Layer 5: Prompt                  # Task-specific instructions
```

## Cloud Context Engineering (Claude Code on the Web)

### Environment Configuration

Claude Code on the web runs in Anthropic-managed cloud infrastructure with isolated VMs per session.

#### SessionStart Hook for Dependencies

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/install_dependencies.sh"
          }
        ]
      }
    ]
  }
}
```

#### Installation Script Example

```bash
#!/bin/bash
# .claude/scripts/install_dependencies.sh

# Check if running in cloud
if [ -n "$CLAUDE_CODE_REMOTE" ]; then
  echo "Setting up cloud environment..."

  # Install Node.js dependencies
  if [ -f package.json ]; then
    pnpm install --frozen-lockfile
  fi

  # Install Python dependencies
  if [ -f requirements.txt ]; then
    pip install -r requirements.txt
  fi

  # Set up environment variables
  if [ -f .env.cloud ]; then
    cp .env.cloud .env
  fi
fi
```

### Cloud-Specific CLAUDE.md

```markdown
# Cloud Environment Setup

## Dependencies
This project requires:
- pnpm@9.12.3 (available by default)
- Node.js 20 LTS (available by default)
- PostgreSQL (available by default)

## SessionStart Hook
Dependencies are installed automatically via `.claude/settings.json`

## Network Access
- GitHub access enabled (via proxy)
- Package manager access enabled
- External APIs: Requires explicit allowlist

## Rate Limiting
- Standard rate limits apply
- Parallel tasks consume proportionally more limits
- Use sequential operations for dependent tasks
```

### Environment Variables in Cloud

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'DATABASE_URL=...' >> $CLAUDE_ENV_FILE"
          }
        ]
      }
    ]
  }
}
```

## Advanced Patterns

### 1. Conditional Context Loading

```markdown
# CLAUDE.md

## Backend Development
@include(BACKEND_PATTERNS.md) when working on API routes

## Frontend Development
@include(FRONTEND_PATTERNS.md) when working on components

## Database Work
@include(DATABASE_SCHEMA.md) when modifying database
```

### 2. Context Composition

Combine multiple context sources:

```
User Request
  → Loads CLAUDE.md (persistent context)
  → Triggers relevant Skills (auto-loaded)
  → Applies PreToolUse hooks (validation)
  → Executes with task-specific prompt
  → Runs PostToolUse hooks (formatting)
```

### 3. Team Standards Enforcement

```
CLAUDE.md               # Team coding standards
  ├── Hooks             # Auto-format on save
  ├── Skills            # Domain patterns
  └── Slash Commands    # Common workflows

Result: Consistent code quality across team
```

## Best Practices Summary

### CLAUDE.md
- ✅ Keep concise (< 2000 lines)
- ✅ Use clear section headers
- ✅ Include specific examples
- ✅ Document anti-patterns
- ✅ Update regularly

### Hooks
- ✅ Use for deterministic automation
- ✅ Keep commands fast (< 2 seconds)
- ✅ Provide clear error messages
- ✅ Test locally before committing
- ⚠️ Review security implications

### Slash Commands
- ✅ Simple, frequently-used prompts
- ✅ Include argument hints
- ✅ Specify allowed tools
- ✅ Provide clear instructions

### Skills
- ✅ Complex domain expertise
- ✅ Specific descriptions for discovery
- ✅ Supporting files for references
- ✅ Version control for teams

## Troubleshooting

### Context Not Loading
- Check file paths (CLAUDE.md in repo root)
- Verify YAML syntax in hooks/commands
- Ensure files are not gitignored
- Check for typos in file references

### Hooks Not Running
- Verify matcher expressions
- Check command syntax and paths
- Ensure scripts are executable (`chmod +x`)
- Test commands independently

### Performance Issues
- Use `/compact` regularly
- Reduce CLAUDE.md size
- Optimize hook commands (avoid slow operations)
- Use modular documentation with references

## Quick Reference

```bash
# Context management
/compact               # Reduce context size
/context               # View context usage
/clear                 # Clear conversation

# View configurations
/agents                # List subagents
/permissions           # Manage permissions

# Files and locations
CLAUDE.md              # Repository root
.claude/CLAUDE.md      # Project config
~/.claude/CLAUDE.md    # User defaults
.claude/settings.json  # Hooks configuration
.claude/commands/      # Slash commands
.claude/skills/        # Skills
```

## Resources

- **Official Docs**:
  - https://code.claude.com/docs/en/claude-code-on-the-web
  - https://code.claude.com/docs/en/hooks-guide
  - https://code.claude.com/docs/en/slash-commands
- **Related**: Subagents Guide (`subagents-guide.md`), Skills Guide (`skills-guide.md`)
- **Examples**: This repository's `.claude/` directory

---

*Source: Claude Code Official Documentation (January 2025)*
