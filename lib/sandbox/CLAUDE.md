# Sandbox Module

## Domain Purpose
Orchestrate Vercel sandbox lifecycle: creation, environment setup, dependency detection, Git configuration, and agent execution orchestration.

## Module Boundaries
- **Owns**: Repository cloning, project type detection, dependency installation, dev server launch, sandbox registry
- **Delegates to**: `agents/` for AI agent execution, `commands.ts` for Vercel SDK operations, `git.ts` for push operations, `package-manager.ts` for detection/installation

## Local Patterns
- **Cancellation Strategy**: 5-stage checks (pre-creation, post-creation, post-deps, pre-git, pre-agent); non-blocking via callback
- **Progress Tracking**: onProgress(percentage, message) callback for UI synchronization
- **Package Managers**: Detect npm/pnpm/yarn; handle multi-fallback for Python pip
- **Dev Server Patterns**: Next.js requires `--webpack` flag; Vite requires `host: true` to disable DNS checking
- **Empty Repos**: Initialize with README to prevent agent startup issues
- **Shallow Clones**: Use `--depth 1` for large repos; timeout after 5 minutes

## Integration Points
- `app/api/tasks/route.ts` - Calls `createSandbox()` at task start
- `lib/sandbox/agents/index.ts` - `executeAgentInSandbox()` after sandbox ready
- `lib/sandbox/git.ts` - `pushChangesToBranch()` after agent completes
- `lib/utils/task-logger.ts` - Real-time log streaming
- `lib/sandbox/sandbox-registry.ts` - Track active sandboxes for cleanup

## Key Files
- `creation.ts` - Main `createSandbox()` function (700+ lines)
- `commands.ts` - Sandbox command execution wrappers
- `package-manager.ts` - npm/pnpm/yarn detection and installation
- `git.ts` - `pushChangesToBranch()`, `shutdownSandbox()` for post-agent Git operations
- `sandbox-registry.ts` - `registerSandbox()`, `unregisterSandbox()`, `getSandbox()`, `killSandbox()` for lifecycle tracking
- `types.ts` - AgentExecutionResult, CancellationCheckFn type definitions
- `config.ts`, `port-detection.ts` - Configuration and port detection utilities
