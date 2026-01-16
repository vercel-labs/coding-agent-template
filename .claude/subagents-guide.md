# Claude Code Subagents Guide

## What Are Subagents?

Subagents are specialized AI assistants that Claude Code can delegate tasks to. Each operates with **its own context window** separate from the main conversation, providing task-specific configurations with custom system prompts, tool access, and focused expertise.

## Key Benefits

- **Context Isolation**: Prevents main conversation pollution while handling focused work
- **Task Specialization**: Deploy experts for code review, debugging, data analysis, or custom workflows
- **Controlled Permissions**: Restrict tool access to specific agent types for security
- **Context Preservation**: Main conversation stays focused on high-level objectives
- **Infinite Nesting Prevention**: Subagents cannot spawn other subagents, preventing runaway recursion

## When to Use Subagents

✅ **Use subagents for:**

- Complex, multi-step tasks requiring focused context
- Specialized workflows (code review, testing, refactoring)
- Tasks requiring different tool permissions than main conversation
- Repetitive patterns that benefit from consistent configuration
- Team-shared workflows that need standardization

❌ **Don't use subagents for:**

- Simple, single-step operations
- Tasks that benefit from main conversation context
- Quick exploratory work

## The Task Tool

In Claude Code, Claude invokes subagents using the Task tool with three parameters:

```typescript
{
  description: string,      // Short 3-5 word task summary
  prompt: string,           // Detailed instructions for the subagent
  subagent_type: string    // Type of specialized agent to use
}
```

**Output includes:**

- `result`: Final result from the subagent
- `usage`: Token usage statistics
- `total_cost_usd`: Total cost in USD
- `duration_ms`: Execution duration in milliseconds

## Creating Custom Subagents

### Quick Setup

1. **Rules First**: Search and review any **Cursor Rules** (@.cursor/rules/*.mdc) related to the agent's domain.
2. Run `/agents` command
3. Select "Create New Agent" (project or user-level)
4. Define:
   - **name**: Unique lowercase identifier with hyphens
   - **description**: When the subagent should be invoked (critical for auto-delegation)
   - **tools** (optional): Comma-separated list; omit to inherit all
   - **model** (optional): `sonnet`, `opus`, `haiku`, or `'inherit'`
   - **permissionMode** (optional): Controls permission handling
   - **skills** (optional): Auto-load specified skill names
5. Write specialized system prompt
6. **Direct Implementation**: Implement the subagent by **directly writing/editing the file** in `.claude/agents/`. Do not just propose the markdown; use the `Write` or `Edit` tools to apply the changes.
7. **Registry Update**: After creation or refinement, you **MUST** update @CLAUDE_AGENTS.md to keep the central registry accurate.
8. Save and invoke (manually or auto-delegate)

### Registry Maintenance

**All subagents must be registered in @CLAUDE_AGENTS.md.**

When adding or refining an agent:
1. Update the **Quick Reference Table** with correct triggers and primary use.
2. Update the **Agent Details** section with the refined mission, tools, and examples.
3. Ensure the **Registry Sync** rules are followed to maintain project-wide visibility of agent capabilities.

### File Structure

```
.claude/agents/          # Project subagents (team-shared)
  ├── ai-sdk-5-expert.md
  ├── ai-tools-expert.md
  ├── artifacts-expert.md
  ├── docs-maintainer.md
  ├── error-expert.md
  ├── general-assistant.md
  ├── latex-bibtex-expert.md
  ├── mcp-vercel-adapter-expert.md
  ├── nextjs-16-expert.md
  ├── performance-expert.md
  ├── phd-academic-writer.md
  ├── react-expert.md
  ├── research-search-expert.md
  ├── security-expert.md
  ├── shadcn-ui-expert.md
  ├── supabase-expert.md
  ├── tailwind-expert.md
  ├── testing-expert.md
  ├── voice-expert.md
  └── workflow-expert.md

~/.claude/agents/        # User subagents (personal)
  └── my-custom-agent.md
```

**Priority**: Project agents override user agents with the same name.

### Agent File Format

```markdown
---
name: code-reviewer
description: Review code for quality, security, and best practices
tools: Read, Grep, Glob
model: sonnet
color: gray
skills: [optional-skill-name]
---

You are a code review expert specializing in...
[system prompt continues]
```

## Best Practices

### 1. Design Principles

- **Start with Claude-generated agents**, then customize
- **Create focused subagents** with single responsibilities
- **Default to Haiku**: Most subagents should use the `haiku` model. Reserve `sonnet` only for agents handling key architectural foundations or high-stakes codebase transformations.
- **Optimal Length**: Aim for 100-200 lines for the entire agent definition. This provides enough detail for the mission while maintaining performance and focus.
- **Rule Alignment**: Always consult **Cursor Rules** (@.cursor/rules/*.mdc) related to the agent's domain to ensure definitions follow established coding and architectural standards.
- **Include specific instructions** and constraints in system prompts
- **Grant only necessary tools** to improve security and focus
- **Version control project subagents** for team collaboration

### 2. Description Writing

The `description` field is critical for automatic delegation. Write descriptions that:

- Clearly state when to use the agent
- Include trigger terms users might mention
- Are specific enough to avoid false positives
- Follow format: "Use when [specific scenario]"

**Example:**

```yaml
# ❌ Too vague
description: Helps with code

# ✅ Specific and actionable
description: Review code for security vulnerabilities, performance issues, and best practices violations
```

### 3. Tool Permissions

```yaml
# Inherit all tools (use sparingly)
tools:

# Restrict to specific tools (recommended)
tools: Read, Grep, Glob, Edit

# Read-only access (for analysis tasks)
tools: Read, Grep, Glob
```

### 4. Model Selection

- **`haiku`**: Fast, cost-effective, and the **default** for most specialized tasks.
- **`sonnet`**: Balanced performance; use for subagents handling key architectural parts or complex mission-critical logic.
- **`opus`**: Complex reasoning and deep analysis; use sparingly for extremely high-complexity tasks.
- **`inherit`**: Use same model as main conversation.

### 5. Writing Effective System Prompts (Prompt Body)

- **Use a consistent structure** so the agent is predictable:
  - **Role**: Who the agent is
  - **Mission**: What “done” means
  - **Constraints / Non-negotiables**: Security, repo invariants, tool limits
  - **Method**: How to gather context (Grep/Read first), how to decide, how to verify
  - **Output format**: A fixed response shape (sections or a schema)

- **Prefer progressive disclosure over huge prompts**:
  - Keep the agent prompt concise.
  - When deeper context is needed, instruct the agent to _read specific files_ (paths) rather than embedding long explanations.
  - Put large, rarely-needed details into separate docs and reference them conditionally (“If you touch X, read Y”).

- **Write guardrails with alternatives**:
  - Avoid only-negative constraints like “Never do X”.
  - Provide a preferred alternative (“Avoid X; do Y instead”) so the agent doesn’t stall.

- **Define an output contract** (strongly recommended):
  - Example sections: `Findings`, `Risks`, `Recommendations`, `Next Actions`.
  - For implementation-oriented agents, also include: `Files to change` and a short `Patch plan`.

- **Make tool usage explicit**:
  - Tell the agent when to use `Grep` vs `Read` vs `Edit`.
  - If the agent is read-only, state that it must not propose edits beyond a plan.

## Advanced Features

### Resumable Subagents

Some host environments support resuming previous agent conversations using an assigned `agentId`. This behavior is host-dependent.

```typescript
// First invocation
Task({
  description: "Initial analysis",
  prompt: "Analyze codebase structure",
  subagent_type: "code-analyzer",
});
// Returns: { agentId: "abc123", result: "..." }

// Resume with additional context
Task({
  description: "Continue analysis",
  prompt: "Now focus on security issues",
  subagent_type: "code-analyzer",
  resume: "abc123", // Resume from previous execution
});
```

**Benefits (when supported):**

- Maintains full context across multiple invocations
- Ideal for iterative refinement
- Supports multi-step workflows
- Transcripts may be stored by the host (paths and formats vary)

### Parallel Invocation

Launch multiple subagents in parallel for efficiency:

```typescript
// In a single message, invoke multiple Task tools
Task({ description: "Analyze code", ... })
Task({ description: "Review tests", ... })
Task({ description: "Check docs", ... })
```

**Use cases:**

- Independent analysis tasks
- Parallel code reviews across modules
- Simultaneous testing and documentation checks

### Sequential Chaining

Coordinate multiple subagents for complex workflows:

```
1. Use code-analyzer to identify issues
2. Use optimizer to fix discovered problems
3. Use test-runner to verify fixes
```

## Performance Optimization

### Context Management

- **Benefit**: Subagents preserve main conversation context
- **Trade-off**: Clean context startup may add latency
- **Strategy**: Use for tasks that justify setup overhead

### Cost Optimization

- Choose appropriate models (haiku for simple tasks)
- Limit tool access to reduce decision overhead
- Use resumable subagents to avoid re-gathering context
- Monitor usage with output token statistics

### Speed Optimization

- Launch independent subagents in parallel
- Use focused system prompts to reduce token generation
- Select `haiku` model for speed-critical tasks
- Keep tool lists minimal

## Cloud Usage (Claude Code on the Web)

### Considerations

- Subagents work identically in web and local environments
- **Rate limiting**: Multiple parallel tasks consume proportionally more limits
- **Network access**: Subagents inherit environment network restrictions
- **Session isolation**: Each web session runs in isolated VMs

### Best Practices for Cloud

1. **Use SessionStart hooks** to configure environment
2. **Specify dependencies** in CLAUDE.md
3. **Limit parallel execution** to manage rate limits
4. **Use resumable subagents** to persist work across rate limit delays

## Pre-Built Subagent Examples

```markdown
---
name: code-reviewer
description: Review code for quality, security, performance regressions, and best practices; use after meaningful code changes or before merging.
tools: Read, Grep, Glob
model: sonnet
---

## Role

You are a senior code reviewer.

## Mission

Review the provided changes and surrounding code for correctness, security, and maintainability.

## Constraints

- Be specific and actionable; avoid generic advice.
- Prefer pointing to the exact file + section to inspect.
- If something is risky, propose a safer alternative.

## Method

1. Identify which files and functions are impacted.
2. Inspect the relevant call sites and invariants.
3. Look for:
   - correctness bugs and edge cases
   - security pitfalls (auth, input validation, secrets, unsafe eval)
   - performance traps (N+1 queries, unbounded loops, expensive renders)
   - API / schema mismatches

## Output format (always)

1. Findings (bullets)
2. Risks (bullets)
3. Recommendations (bullets)
4. Next actions (numbered)
```

## Troubleshooting

### Subagent Not Invoked Automatically

- Check description field specificity
- Ensure YAML frontmatter is valid
- Verify file is in correct location
- Test with explicit invocation first

### Context Issues

- Use resumable subagents for multi-step tasks
- Avoid passing large context in prompt
- Let subagent gather its own context with Read/Grep

### Permission Errors

- Review `allowed-tools` in agent definition
- Check main conversation's `/permissions` settings
- Verify environment has necessary tool access

## Quick Reference

```bash
# List available subagents
/agents

# View current subagent execution
# (Subagent output appears inline)

# Configure permissions
/permissions

# Check transcripts (for resumable agents)
ls .claude/transcripts/
```

## Resources

- **Official Docs**: https://code.claude.com/docs/en/sub-agents
- **Related**: Skills Guide (`skills-guide.md`), Context Engineering Guide (`context-engineering-guide.md`)
- **Examples**: `.claude/agents/` directory in your project

---

_Source: Claude Code Official Documentation (December 2025)_
