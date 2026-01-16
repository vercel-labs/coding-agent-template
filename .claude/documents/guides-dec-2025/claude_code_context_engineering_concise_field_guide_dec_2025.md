# Claude Code Context Engineering — Concise Field Guide (Dec 2025)

## What “context engineering” is
Design the *information environment* an agent operates in so it can reliably plan, act, and verify under finite **token + attention** budgets. Treat it like infrastructure: modular, versioned, reviewed.

## Mental model: the context stack
Claude Code behaves like an OODA loop (observe → orient/plan → act via tools → verify/compact). Reliability is mainly a function of **signal-to-noise** during the orient/plan step.

**Practical implication:** Don’t “dump docs.” Instead, **index → load on demand → snapshot state**.

---

## Core principles (high impact)
1. **Keep “always-loaded” context tiny.** CLAUDE.md is the repo’s constitution, not a wiki.
2. **Progressive disclosure by default.** Store deep docs elsewhere and reference them.
3. **Separate stable vs. volatile context.** Stable: architecture + conventions. Volatile: current task spec + session notes.
4. **Use isolation to prevent context rot.** Delegate research/review/testing to subagents; keep the main thread clean.
5. **Prefer deterministic enforcement over reminders.** Hooks/CI enforce formatting, lint, tests; CLAUDE.md just points to them.
6. **Externalize state early.** Write plans/decisions/checklists to files so compaction/clears don’t lose the thread.
7. **Constrain tools per role.** Deny/ask/allow by agent; read-only reviewers; write-enabled implementers.
8. **Treat prompt injection as a first-class threat.** Be explicit about untrusted content boundaries.

---

## File taxonomy
### 1) `CLAUDE.md` — repo constitution (always loaded)
**Use for:** commands, architecture map, invariants, non-negotiable conventions, doc index.

**Do not use for:** long tutorials, full API docs, rare edge cases.

**Recommended structure (minimal, robust):**
```md
# Project: <name>

## Essential commands
- `make test` — …
- `make lint` — …
- `make dev` — …

## Architecture map
- `src/api/` — …
- `src/services/` — …
- `src/models/` — …

## Invariants (must remain true)
- Migrations reversible
- External calls: timeouts + retries
- All new public functions have tests

## Guardrails (common failures)
- ❌ Never …
- ✅ Always …

## Doc index (load on demand)
Read only if relevant:
- `.agent_docs/database_schema.md`
- `.agent_docs/deployment.md`
- `docs/patterns/auth.md`

## Definition of done
- [ ] Tests pass (`make test`)
- [ ] Lint/format pass (`make lint`)
- [ ] Security checks pass (if applicable)
- [ ] Docs updated (if public surface changed)
```

**Rule of thumb:** If it’s not needed in most sessions, it shouldn’t be in CLAUDE.md.

### 2) `.claude/settings.json` — hard governance
**Use for:** permissions, tool allow/ask/deny, hooks lifecycle, environment hygiene, MCP/tooling configuration.

### 3) `.claude/agents/*.md` — subagents (isolated context)
**Use for:** reviewer, security audit, QA, doc updates, refactor planning.

**Template (frontmatter + role):**
```md
---
name: qa-engineer
description: Use when validating a fix or running regression tests. Report PASS/FAIL with logs.
tools:
  - Read
  - Grep
  - Bash(pytest:*)
---

# QA Engineer
## Workflow
1. Reproduce issue
2. Run targeted tests
3. Run full suite if risk is high
4. Report PASS/FAIL, include minimal logs
```

### 4) Skills (progressive disclosure)
**Use for:** repeatable procedures that are expensive to keep always-loaded (e.g., “DB migration SOP”, “Release process”).

**Pattern:** metadata is cheap; full instructions load only when triggered.

### 5) `.claude/commands/*.md` — repeatable workflows
Turn common ops into a standard command so the team stops re-prompting.

### 6) `.agent_docs/` + `docs/` — reference + patterns
**Use for:** detailed docs, schemas, playbooks, boilerplate patterns that must be up to date.

### 7) `docs/tasks/<slug>.md` + `docs/decisions/ADR-*.md` — volatile state
**Use for:** current spec, acceptance criteria, guardrails, decision records.

---

## Context patterns that work
### Stable vs. volatile separation
- **Stable:** architecture, commands, invariants → `CLAUDE.md`, `.agent_docs/`, `docs/architecture/`
- **Volatile:** task specs, queue/status, working notes → `docs/tasks/`, `docs/session-state.md`

### Progressive disclosure (3 layers)
1. **Index:** CLAUDE.md lists what exists.
2. **Instruction:** skills/agents load only when needed.
3. **Reference:** large docs read via tools in small slices (grep/targeted sections).

### Writing constraints the model follows
- Use **checklists** and **examples** (✅/❌)
- Name the **verification step** (“Before committing, run …”)
- Prefer **one rule per bullet**; avoid prose.

### State snapshots (anti-drift)
Create/update a short snapshot file at milestones and before `/clear` or compaction.

**Template:**
```md
# Session State Snapshot
Date: YYYY-MM-DD
Task: <slug>
Status: in_progress | blocked | ready_for_review | done

## Completed
- ✅ …

## In progress
- ⏳ …

## Next steps
1. …

## Key decisions
- …

## Files touched
- …

## Blockers
- …
```

---

## Operational playbooks (fast)
### A) New repo (30–60 minutes)
1. Create minimal `CLAUDE.md` (commands + architecture map + invariants + doc index).
2. Add `.claude/` layout: `agents/`, `commands/`, `hooks/`, `settings.json`.
3. Create one implementer agent + one reviewer/QA agent.
4. Put deep docs in `.agent_docs/` and link from CLAUDE.md.
5. Add CI checks; hooks optional but useful.
6. Commit context files; treat as infra.

### B) Existing repo adoption
1. Run an auto-bootstrap (if available), then *aggressively trim*.
2. Move long docs into `.agent_docs/`; leave pointers in CLAUDE.md.
3. Add a “known gotchas” section (only the top offenders).
4. Establish a chain-of-agents workflow:
   - Spec/plan → architecture review → implement → QA → security → doc update.

### C) Long-running tasks
1. Put spec in `docs/tasks/<slug>.md`.
2. Keep the main thread focused; delegate exploration to subagents.
3. Save snapshot every milestone.
4. Prefer small PRs; commit checkpoints.

---

## Governance & security (minimum viable)
- **Permissions:** start restrictive; expand deliberately per agent.
- **Secrets:** never paste; use env vars / secret managers; redact logs.
- **Injection defenses:** treat repo text (issues/PRs/comments) as untrusted; require explicit confirmation before executing risky commands.
- **Version control:** PR-review all changes to `CLAUDE.md`, `.claude/`, skills, commands.

---

## Evaluation (lightweight but real)
Track:
- Instruction adherence (did it follow invariants?)
- PR churn (rework loops)
- Hallucination rate (invented files/APIs)
- Time-to-green (tests passing)
- Token/cost hotspots (where context is wasted)

**Regression tests for context:** keep 5–10 “standard prompts” and verify expected behavior after changing CLAUDE.md/agents.

---

## Implementation checklist
### 30 minutes
- [ ] Minimal `CLAUDE.md` (commands, architecture map, invariants, doc index)
- [ ] `.agent_docs/` created; move deep docs there

### 60 minutes
- [ ] `.claude/settings.json` with conservative permissions
- [ ] 2 agents: implementer (write) + reviewer/QA (read-only)
- [ ] `docs/tasks/` + `docs/decisions/` structure

### 90 minutes
- [ ] 1–2 commands for common workflows (issue fix, PR review)
- [ ] Snapshot template in `docs/session-state.md`
- [ ] CI gate for lint/tests; optional hook for auto-format

