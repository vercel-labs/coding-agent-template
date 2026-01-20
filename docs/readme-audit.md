# README.md Audit Report

**Date**: January 20, 2026
**Auditor**: Documentation Architect
**Status**: Findings documented - ready for remediation

---

## Executive Summary

The README.md contains **multiple critical inaccuracies and stale references** that conflict with the actual codebase. The most significant issues are:

1. **Repository URL mismatch**: README references `vercel-labs/coding-agent-template` throughout, but this is the `agenticassets/AA-coding-agent` fork
2. **Out-of-date deployment instructions**: Links to Vercel Deploy button point to wrong repository
3. **Deprecated database setup procedure**: README recommends `pnpm db:push` but CLAUDE.md documents a workaround required for local development
4. **Inconsistent GitHub references**: GitHub stars button, homepage links still point to original vercel-labs repo
5. **Outdated AI models**: References Claude models that don't match current CLAUDE.md specifications
6. **MCP documentation split**: README and docs/MCP_SERVER.md have overlapping content with subtle differences

---

## Detailed Findings

### 1. CRITICAL: Repository URL References (Lines 11, 47, 351)

**Issue**: README references `https://github.com/vercel-labs/coding-agent-template` throughout.

**Actual State**: This is `https://github.com/agenticassets/AA-coding-agent` (per git repo and CLAUDE.md).

**Impact**:
- Deploy with Vercel button (line 11) links to wrong repo
- "Quick Start" git clone (line 47) targets wrong repo
- "Local Development Setup" git clone (line 351) targets wrong repo
- Users cloning from wrong URL will not get the current codebase

**Evidence**:
- `lib/constants.ts` line 10: Contains hardcoded Vercel Deploy URL pointing to `vercel-labs/coding-agent-template`
- `lib/github-stars.ts` line 1: `const GITHUB_REPO = 'vercel-labs/coding-agent-template'`
- `components/home-page-mobile-footer.tsx` line 8: Points to `vercel-labs/coding-agent-template`
- `components/github-stars-button.tsx` line 7: Points to `vercel-labs/coding-agent-template`

**Severity**: CRITICAL

---

### 2. CRITICAL: Development Server Instructions (Lines 490-491)

**Issue**: README recommends `pnpm dev` as normal development flow.

```bash
# Line 490-491 from README
pnpm dev

# Line 492
Open [http://localhost:3000](http://localhost:3000) in your browser.
```

**Actual State**: CLAUDE.md explicitly forbids this (Section "CRITICAL: Never Run Dev Servers"):

```
DO NOT run `pnpm dev`, `next dev`, or any long-running development servers.
They block the terminal and conflict with existing instances.
```

**Impact**: New developers will be instructed to run long-running dev servers, violating project policy.

**Note**: README Section "Running the App" (lines 511-521) repeats the same problematic guidance.

**Severity**: CRITICAL

---

### 3. CRITICAL: Database Setup Workaround Missing

**Issue**: README recommends straightforward database setup:

```bash
# Lines 483-485
pnpm db:generate
pnpm db:push
```

**Actual State**: CLAUDE.md documents a required workaround for local development (lines 49-60):

```bash
# CLAUDE.md shows this is needed because drizzle-kit doesn't auto-load .env.local
cp .env.local .env
DOTENV_CONFIG_PATH=.env pnpm tsx -r dotenv/config node_modules/drizzle-kit/bin.cjs migrate
rm .env
```

**Impact**: Users will attempt `pnpm db:push` locally, which will fail unless they set up environment variables correctly.

**Evidence**: CLAUDE.md section "Initial Project Setup" explains: "drizzle-kit doesn't auto-load .env.local"

**Severity**: HIGH - Users will encounter database migration failures

---

### 4. DEPRECATED: Outdated Environment Variable Documentation

**Issue**: README shows `GITHUB_TOKEN` environment variable (lines 432-435):

```markdown
- ~~`GITHUB_TOKEN`~~: **No longer needed!** Users authenticate with their own GitHub accounts.
```

This is marked as deprecated but still appears in environment variable sections. The strikethrough formatting is inconsistent with how deprecation should be documented.

**Actual State**: CLAUDE.md confirms `GITHUB_TOKEN` is no longer used (confirmed in v2.0 breaking changes).

**Recommendation**: Clarify that this variable should be removed from existing deployments.

**Severity**: MEDIUM

---

### 5. INCONSISTENCY: Database Connection Details

**Issue**: README states (line 369):

> Your PostgreSQL connection string (automatically provided when deploying to Vercel via the Neon integration, or set manually for local development)

**Actual State**: The "Deploy with Vercel" button (line 11) references `&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D` which indicates PostgreSQL but doesn't specify Neon. The button description (line 14) also says "Neon Postgres database" but this depends on Vercel's current defaults.

**Note**: This is minor but could confuse users about which database solution is used.

**Severity**: LOW - Documentation is mostly accurate

---

### 6. OUTDATED: AI Models in Examples (Line 205)

**Issue**: README shows deprecated model in REST API example (line 205):

```bash
"model": "claude-sonnet-4-5-20250929"
```

**Actual State**: CLAUDE.md references newer Claude models:
- `claude-sonnet-4-5-20250929` (older)
- `claude-opus-4-5-20251101` (current frontier model per claude_background_info)

**Impact**: Example code suggests outdated models. Users should use the latest available models.

**Recommendation**: Update example to use `claude-opus-4-5-20251101` or note that users should check available models.

**Severity**: LOW - Still works, but not current best practice

---

### 7. DUPLICATION: MCP Server Documentation Split

**Issue**: README includes extensive MCP Server section (lines 140-183, 264-344) but there's also `docs/MCP_SERVER.md` with overlapping content.

**Specific Overlaps**:
- README lines 175-180: Lists MCP tools (create-task, get-task, etc.)
- docs/MCP_SERVER.md lines 17-24: Same tool listing
- README lines 268-313: MCP server preset list
- docs/MCP_SERVER.md lines 90-300+: Detailed tool documentation

**Impact**: Maintenance burden - changes need to be made in two places. README version is less detailed (good for overview) but doc version is more complete.

**Recommendation**: Keep brief MCP overview in README, link to `docs/MCP_SERVER.md` for complete documentation.

**Severity**: MEDIUM - Not critical but reduces maintainability

---

### 8. INCOMPLETE: Quick Start Section (Lines 40-53)

**Issue**: "TL;DR" quick start doesn't match the full setup requirements.

```bash
# Lines 46-52 show:
git clone https://github.com/vercel-labs/coding-agent-template.git  # WRONG REPO
cd coding-agent-template
pnpm install
# Set up .env.local with required variables
pnpm db:push  # MISSING WORKAROUND
pnpm dev      # FORBIDDEN
```

**Problems**:
1. Wrong repository URL
2. Missing environment variable details
3. `pnpm db:push` without workaround will fail
4. `pnpm dev` violates project policy

**Impact**: Users following TL;DR will encounter multiple failures.

**Severity**: CRITICAL

---

### 9. MISSING: Code Quality Checks in Workflow

**Issue**: README doesn't mention code quality requirements found in CLAUDE.md.

CLAUDE.md mandates (lines 88-93):
```bash
pnpm format
pnpm type-check
pnpm lint
```

But README has no mention of running these after editing code.

**Impact**: Developers won't know about mandatory code quality checks before deployment.

**Severity**: MEDIUM - Security/quality issue

---

### 10. INCONSISTENCY: API Key Configuration

**Issue**: README section "API Keys (Optional - Can be per-user)" (lines 414-429) shows correct per-user override pattern, but doesn't clearly state:

1. Whether `AI_GATEWAY_API_KEY` is used for branch name generation (it is, per CLAUDE.md)
2. The priority logic for API keys (user keys override environment variables)
3. That `ANTHROPIC_API_KEY` is specifically for Claude models, not all Claude agent usage

**Evidence**: CLAUDE.md lines 155-172 explain AI Gateway support in detail with priority logic.

**Severity**: MEDIUM - Users may configure keys incorrectly

---

### 11. MISSING: Neon Database Workaround

**Issue**: README doesn't explain how to set up a local PostgreSQL database for development.

**Actual State**: While Neon is mentioned for Vercel deployments, there's no guidance for developers who want to use:
- Local PostgreSQL
- Other PostgreSQL hosts
- Docker containerized Postgres

**Severity**: LOW - Users can figure this out, but guidance would help

---

### 12. VERIFICATION FAILURES: External Links

**Checked External Links**:

| Link | Status | Notes |
|------|--------|-------|
| `https://ui.shadcn.com/` | Valid | Exists (referenced in README line 256) |
| `https://vercel.com/docs/vercel-sandbox` | Valid | Exists (referenced in README line 23) |
| `https://vercel.com/docs/ai-gateway` | Valid | Exists (referenced in CLAUDE.md) |
| `https://orm.drizzle.team/docs/overview` | Valid | Exists (referenced in CLAUDE.md) |
| `docs/MCP_SERVER.md` | Exists | File exists at C:\...\docs\MCP_SERVER.md ✓ |
| GitHub OAuth setup link (line 455) | Valid | GitHub settings page exists |
| Vercel Dashboard link (line 469) | Valid | Vercel settings exists |

**Result**: All checked external links are valid. No broken links found.

---

### 13. CHANGELOG: Accuracy Check

**Issue**: Changelog section (lines 540-738) is comprehensive and accurate.

**Verified Against CLAUDE.md**:
- Breaking changes listed (lines 572-607) match CLAUDE.md expectations ✓
- Migration guide (lines 608-705) provides reasonable instructions ✓
- New features (lines 546-570) align with codebase ✓

**Note**: This section is one of the better-maintained parts of README.

**Severity**: None - This section is accurate

---

## Summary Table

| Issue | Type | Severity | Location(s) |
|-------|------|----------|-------------|
| Wrong repository URLs | Inaccuracy | CRITICAL | Lines 11, 47, 351 |
| Dev server instructions contradict policy | Conflict | CRITICAL | Lines 490-491, 514 |
| Missing database workaround | Incomplete | CRITICAL | Lines 483-485 |
| Quick Start has multiple issues | Incomplete | CRITICAL | Lines 40-53 |
| MCP documentation split | Duplication | MEDIUM | Lines 140-183, 264-344 |
| API key configuration unclear | Incomplete | MEDIUM | Lines 414-429 |
| Missing code quality checks | Omission | MEDIUM | Entire setup section |
| Outdated model in example | Outdated | LOW | Line 205 |
| Inconsistent deprecation marking | Style | LOW | Lines 432-435 |
| Missing local PostgreSQL guidance | Omission | LOW | Database section |

---

## Recommendations for Remediation

### Phase 1: CRITICAL Fixes (Blocking)
1. **Update all repository URLs** from `vercel-labs/coding-agent-template` to `agenticassets/AA-coding-agent`
   - Update `README.md` lines 11, 47, 351
   - Update `lib/constants.ts` line 10 (Vercel Deploy button URL)
   - Update `lib/github-stars.ts` line 1
   - Update component references
   - Update `package.json` if it has repo links

2. **Remove dev server instructions** from user-facing guidance
   - Replace lines 487-493 with guidance to "let the user start the dev server" or "use cloud deployment"
   - Add note: "See CLAUDE.md for production build guidelines"

3. **Add database workaround to setup instructions**
   - Include workaround steps before `pnpm db:push`
   - Explain why the workaround is needed (drizzle-kit and .env.local)

4. **Fix Quick Start section**
   - Correct repository URL
   - Add database workaround steps
   - Replace `pnpm dev` with build verification or cloud deployment guidance

### Phase 2: HIGH Priority Fixes
5. **Consolidate MCP documentation**
   - Keep brief overview in README (150-200 words)
   - Move detailed preset servers list to `docs/MCP_SERVER.md`
   - Add prominent link: "See [docs/MCP_SERVER.md](docs/MCP_SERVER.md) for complete MCP documentation"

6. **Clarify API key configuration**
   - Document API key priority logic
   - Specify which keys are for which agents
   - Link to `CLAUDE.md` for detailed AI agent configuration

7. **Add code quality checks to setup**
   - Document required commands: `pnpm format`, `pnpm type-check`, `pnpm lint`
   - State these are required before deployment
   - Reference CLAUDE.md section for full details

### Phase 3: MEDIUM Priority Improvements
8. **Update example models**
   - Use `claude-opus-4-5-20251101` in examples
   - Document how users can discover available models

9. **Add local PostgreSQL development guidance**
   - Document Docker Postgres setup example
   - Or link to external PostgreSQL installation guides

10. **Improve API key documentation**
    - Create a separate "API Keys & Models" section
    - Include priority logic
    - Show per-user override examples

11. **Verify and update repository metadata**
    - Check if `package.json` has repository field pointing to old repo
    - Update issue/PR template links if they exist
    - Update any CI/CD workflows that reference old repository

---

## Validation Checklist

Before marking remediation complete, verify:

- [ ] All repository URLs point to `agenticassets/AA-coding-agent`
- [ ] No instructions recommend running `pnpm dev` for local development
- [ ] Database setup includes drizzle-kit workaround
- [ ] Quick Start section can be followed successfully
- [ ] All external links remain valid
- [ ] Code quality commands (`format`, `type-check`, `lint`) are documented
- [ ] MCP documentation is consolidated without duplication
- [ ] API key priority logic is clearly explained
- [ ] Example code uses current Claude models
- [ ] CLAUDE.md and README.md are consistent

---

## Files Requiring Updates

### Direct README.md Changes
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\README.md`

### Code Changes (Repository URLs)
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\lib\constants.ts`
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\lib\github-stars.ts`
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\components\github-stars-button.tsx`
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\components\home-page-mobile-footer.tsx`
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\components\api-keys-dialog.tsx` (if applicable)

### Documentation Updates
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\docs\MCP_SERVER.md` (consolidate overlaps)

### Potential Issues
- `C:\Users\cas3526\dev\Agentic-Assets\AA-coding-agent\package.json` (may have wrong repository URL)

---

## Cross-Reference with Source of Truth

**Source of Truth Files Checked**:
1. `CLAUDE.md` - Development workflow, security policies ✓
2. `package.json` - Scripts, version info ✓
3. `drizzle.config.ts` - Database configuration ✓
4. `lib/db/schema.ts` - Database structure ✓
5. `lib/constants.ts` - Configuration values ✓
6. Git repository metadata - Repository name and ownership ✓

**Conclusion**: README.md contains outdated information that conflicts with the actual codebase state and current repository ownership.
