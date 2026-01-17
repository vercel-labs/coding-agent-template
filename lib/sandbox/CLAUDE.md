# Sandbox Module

## Domain Purpose
Create, configure, and manage isolated Vercel sandboxes for AI agent execution. Handles environment setup, dependency installation, Git operations, and agent lifecycle management.

## Key Responsibilities
- **Sandbox Lifecycle**: Create sandboxes, clone repos, detect project types, install dependencies (Node/Python)
- **Environment Setup**: Validate credentials, configure API keys, setup Git author info, detect package managers
- **Development Server**: Auto-detect and start dev servers (Next.js, Vite), manage ports for CLI demos
- **Git Operations**: Branch creation, commit preparation, push to remote with permission handling
- **Dependency Management**: Detect npm/pnpm/yarn, Python environments; handle fallbacks gracefully
- **Timeout Handling**: Honor user-specified durations, implement cancellation checks throughout workflow

## Module Boundaries
- **Delegates to**: `lib/sandbox/agents/` for AI agent execution
- **Delegates to**: `lib/sandbox/commands.ts` for low-level Vercel SDK operations
- **Delegates to**: `lib/sandbox/git.ts` for Git push operations
- **Delegates to**: `lib/sandbox/package-manager.ts` for package detection and installation
- **Owned**: Repository cloning, dependency detection, dev server launch, sandbox registry

## Core Types & Patterns
```typescript
// SandboxConfig: Full configuration for sandbox creation
// SandboxResult: success, sandbox, domain, branchName, error, cancelled
// Key callbacks: onProgress(), onCancellationCheck()
```

## Local Patterns
- **Progress Tracking**: onProgress(percentage, message) - ui/backend synchronization
- **Cancellation**: Checks at 5 stages: pre-creation, post-creation, post-deps, pre-git, pre-agent
- **Logging**: Use TaskLogger (static strings only, no dynamic values)
- **Error Handling**: Catch errors early, provide helpful messages (timeout detection, permission issues)

## Critical Security Notes
- **No Logs of Credentials**: API keys/tokens appear in error messages but are redacted by `redactSensitiveInfo()`
- **GitHub Token Encoding**: Embedded in URLs as `username:x-oauth-basic@github.com`
- **Environment Variable Priority**: User-provided keys override env vars (set temporarily during execution)

## Integration Points
- **app/api/tasks/route.ts**: Calls `createSandbox()` with user config
- **lib/sandbox/agents/index.ts**: `executeAgentInSandbox()` after sandbox is ready
- **lib/sandbox/sandbox-registry.ts**: Track active sandboxes by taskId for cleanup
- **lib/sandbox/git.ts**: `pushChangesToBranch()` called after agent completes
- **lib/utils/task-logger.ts**: Real-time log streaming to database

## Files in This Module
- `creation.ts` - Main `createSandbox()` function; 700+ lines of setup logic
- `types.ts` - SandboxConfig, SandboxResult, AgentExecutionResult interfaces
- `agents/` - Subdirectory with agent implementations
- `git.ts` - `pushChangesToBranch()`, `shutdownSandbox()` utilities
- `commands.ts` - Low-level `runCommandInSandbox()`, `runInProject()` wrappers
- `config.ts` - Environment validation, URL auth encoding, config builders
- `package-manager.ts` - Detection and installation (npm/pnpm/yarn)
- `sandbox-registry.ts` - Track and kill active sandboxes by ID
- `port-detection.ts` - Port discovery for running services

## Common Workflows
1. **Create Sandbox**: Clone repo → Detect project type → Install dependencies → Configure Git → Create branch
2. **Resume Sandbox**: Skip clone/install; verify Git state; create new branch or reuse existing
3. **Handle Large Repos**: Shallow clone (--depth 1); timeout after 5 mins; helpful error messages
4. **Dev Server Auto-Start**: Detect package.json scripts; configure Vite host; start in detached mode

## Gotchas & Edge Cases
- **Next.js 16 Detection**: Requires `--webpack` flag for dev server
- **Vite Host Checking**: Auto-configure `host: true` to disable Vite's DNS checking
- **Python pip Install**: Multi-fallback approach (curl get-pip.py → apt-get); don't fail if pip unavailable
- **Shallow Clone Limits**: Some large repos may fail with depth=1; verbose timeout error explains this
- **Empty Repos**: Initialize main branch with README; helps agents get started
- **keepAlive vs timeout**: User timeout is max sandbox lifetime; keepAlive only skips shutdown after task
