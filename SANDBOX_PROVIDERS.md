# Sandbox Provider Implementation Guide

This document provides detailed information about the sandbox providers implemented in this project.

## Overview

The application supports four sandbox providers for executing AI coding agents in isolated environments:

1. **Vercel Sandbox** - Cloud-based, production-ready
2. **Docker** - Local containerized execution
3. **E2B** - Cloud code interpreter
4. **Daytona** - Fast cloud sandboxes with native Git API

## Provider Comparison

| Feature                  | Vercel         | Docker         | E2B                 | Daytona        |
| ------------------------ | -------------- | -------------- | ------------------- | -------------- |
| **Location**             | Cloud          | Local          | Cloud               | Cloud          |
| **Creation Speed**       | ~5-10s         | ~2-5s          | ~3-8s               | **<90ms**      |
| **Git Operations**       | Shell commands | Shell commands | Shell commands      | **Native API** |
| **Agent Execution**      | ✅ All agents  | ✅ All agents  | ✅ All agents       | ✅ All agents  |
| **Inngest Reconnection** | ✅             | ✅             | ✅                  | ✅             |
| **Git Push**             | ✅             | ⏳ Pending     | ⏳ Pending          | ⏳ Pending     |
| **Cost**                 | Pay per use    | Free (local)   | Pay per use         | Pay per use    |
| **Setup Complexity**     | Medium         | Low            | Low                 | Low            |
| **Best For**             | Production     | Dev/Testing    | Code interpretation | Fast iteration |

## Architecture

### Provider Interface

All providers implement the `SandboxProvider` interface:

```typescript
interface SandboxProvider {
  readonly type: SandboxType

  create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult>

  executeAgent(
    sandbox: SandboxInstance,
    instruction: string,
    agentType: AgentType,
    logger: TaskLogger,
    selectedModel?: string,
    mcpServers?: Connector[],
  ): Promise<ExecutionResult>

  destroy(sandbox: SandboxInstance, logger: TaskLogger): Promise<{ success: boolean; error?: string }>
}
```

### Inngest Serialization Challenge

When Inngest orchestrates tasks across multiple steps, sandbox objects are serialized/deserialized. This causes sandbox instances to lose their methods.

**Solution**: Each provider implements a reconnection mechanism:

```typescript
private async getSandboxFromInstance(sandbox: SandboxInstance): Promise<NativeSandbox> {
  // Check if native sandbox still has methods
  if (sandbox.nativeSandbox?.methodExists) {
    return sandbox.nativeSandbox
  }

  // Reconnect using sandbox ID
  const sandboxId = sandbox.metadata?.sandboxId || sandbox.id
  return await provider.connect(sandboxId, credentials)
}
```

## Provider-Specific Details

### 1. Vercel Sandbox

**File**: `lib/sandbox/providers/vercel.ts`

**Setup**:

```bash
# Required environment variables
VERCEL_TEAM_ID=your_team_id
VERCEL_PROJECT_ID=your_project_id
VERCEL_TOKEN=your_vercel_token
```

**Features**:

- Managed cloud infrastructure
- Automatic scaling
- Built-in observability
- Full git push support

**Git Operations**:

- Uses `nativeSandbox.commands.run()` for git commands
- Creates branches, commits, and pushes via shell

**Reconnection**:

- Uses `@vercel/sdk` to reconnect via `sandbox.get()`
- Retrieves deployment info to restore sandbox state

**Best For**:

- Production deployments
- Teams already using Vercel
- When you need full observability

---

### 2. Docker (Local)

**File**: `lib/sandbox/providers/docker.ts`

**Setup**:

```bash
# Required
CLAUDE_CODE_OAUTH_TOKEN=your_oauth_token

# Docker Desktop must be installed and running
```

**Features**:

- No cloud costs
- Fast execution (local resources)
- Full control over container configuration
- Great for development/testing

**Implementation Details**:

- Creates Docker containers with Node.js base image
- Clones repo into `/tmp/workspace`
- Installs dependencies and agent CLIs
- Streams stdout/stderr via Docker modem demultiplexing

**Git Operations**:

- Uses `docker exec` to run git commands
- Branch creation and checkout work
- Git push pending implementation

**Reconnection**:

- Stores container ID in `sandbox.metadata.containerId`
- Uses `docker.getContainer(id)` to reconnect

**Key Implementation**:

```typescript
// Container creation
const container = await docker.createContainer({
  Image: 'node:18',
  Cmd: ['/bin/bash'],
  Tty: false,
  OpenStdin: true,
  WorkingDir: '/tmp/workspace',
})

// Stream demuxing for proper stdout/stderr
container.modem.demuxStream(stream, stdout, stderr)
```

**Best For**:

- Local development
- Testing without cloud costs
- Full control over execution environment

---

### 3. E2B (Cloud)

**File**: `lib/sandbox/providers/e2b.ts`

**Setup**:

```bash
# Get your API key from https://e2b.dev/dashboard
E2B_API_KEY=e2b_your_api_key
```

**Features**:

- Cloud-based code interpreter
- Sub-second startup after first use
- Stateful execution environment
- Built for AI code execution

**Implementation Details**:

- Uses `@e2b/code-interpreter` SDK
- Executes commands via `sandbox.runCode(cmd, { language: 'bash' })`
- Supports timeout configuration per command
- Python and TypeScript code interpretation built-in

**Timeout Configuration**:

```typescript
await sandbox.runCode(command, {
  language: 'bash',
  timeoutMs: 1_800_000, // 30 minutes for agent execution
})
```

**Git Operations**:

- Shell-based via `runCode()` with bash commands
- No native Git API (unlike Daytona)

**Reconnection**:

- Uses `Sandbox.connect(sandboxId, { apiKey })`
- Code interpreter Sandbox inherits from base e2b Sandbox
- Maintains all runCode() functionality after reconnection

**Key Implementation**:

```typescript
// Reconnection after Inngest serialization
const { Sandbox } = await import('@e2b/code-interpreter')
const reconnectedSandbox = await Sandbox.connect(sandboxId, {
  apiKey: process.env.E2B_API_KEY,
})
```

**Best For**:

- Code interpretation tasks
- Running untrusted code safely
- Quick prototyping

---

### 4. Daytona (Cloud)

**File**: `lib/sandbox/providers/daytona.ts`

**Setup**:

```bash
# Get your API key from https://app.daytona.io/dashboard/keys
DAYTONA_API_KEY=dtn_your_api_key
```

**Features**:

- **Sub-90ms sandbox creation** (advertised)
- **Native Git API** - no shell command wrappers!
- Stateful sandboxes (run indefinitely)
- Full Docker image support
- Multi-region deployment

**Implementation Details**:

- Uses `@daytonaio/sdk` TypeScript SDK
- Native `sandbox.git.*` methods for all Git operations
- Process execution via `sandbox.process.executeCommand()`
- Clean, typed interfaces throughout

**Native Git API Examples**:

```typescript
// Clone repository
await sandbox.git.clone(repoUrl, workDir)

// Create and checkout branch
await sandbox.git.createBranch(workDir, branchName)
await sandbox.git.checkoutBranch(workDir, branchName)

// Get status
const status = await sandbox.git.status(workDir)
console.log(status.currentBranch) // typed!

// Stage and commit (pending implementation for push)
await sandbox.git.add(workDir, ['.'])
await sandbox.git.commit(workDir, message, author, email)
```

**Process Execution**:

```typescript
const result = await sandbox.process.executeCommand(
  'npm install',
  workDir,
  undefined, // env vars
  600, // timeout in seconds
)
```

**Reconnection**:

- Uses `daytona.get(sandboxId)` to reconnect
- Maintains full SDK functionality after reconnection
- All Git and process methods available

**Advantages Over Other Providers**:

1. **Native Git API** - Type-safe, no shell escaping issues
2. **Speed** - Fastest creation time of all cloud providers
3. **Clean SDK** - Modern TypeScript with proper types
4. **Stateful** - Sandboxes persist, great for debugging

**Best For**:

- Fast iteration during development
- When you need frequent sandbox creation/destruction
- Projects requiring extensive Git operations
- Teams wanting modern, typed interfaces

---

## Environment Variable Summary

### All Providers

```bash
POSTGRES_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
AI_GATEWAY_API_KEY=...
```

### Vercel-Specific

```bash
VERCEL_TEAM_ID=team_...
VERCEL_PROJECT_ID=prj_...
VERCEL_TOKEN=...
```

### Docker-Specific

```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-...
# Docker Desktop must be running
```

### E2B-Specific

```bash
E2B_API_KEY=e2b_...
```

### Daytona-Specific

```bash
DAYTONA_API_KEY=dtn_...
```

## Adding a New Provider

To add a new sandbox provider:

1. **Create provider file**: `lib/sandbox/providers/your-provider.ts`

2. **Implement the interface**:

```typescript
export class YourProviderSandboxProvider implements SandboxProvider {
  readonly type = 'your-provider' as const

  async create(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
    // Create sandbox
    // Clone repository
    // Set up git branch
    // Return SandboxInstance
  }

  private async getSandboxFromInstance(sandbox: SandboxInstance) {
    // Handle reconnection after Inngest serialization
  }

  async executeAgent(...): Promise<ExecutionResult> {
    // Install agent CLI
    // Execute agent with instruction
    // Return results
  }

  async destroy(sandbox: SandboxInstance, logger: TaskLogger) {
    // Clean up sandbox
  }
}
```

3. **Register provider**: Add to `lib/sandbox/providers/index.ts`

```typescript
import { YourProviderSandboxProvider } from './your-provider'

providers.set('your-provider', new YourProviderSandboxProvider())
```

4. **Update types**: Add to `SandboxType` in `lib/sandbox/providers/types.ts`

```typescript
export type SandboxType = 'vercel' | 'docker' | 'e2b' | 'daytona' | 'your-provider'
```

5. **Update UI**: Add to sandbox selectors in:
   - `components/task-form.tsx`
   - `components/task-actions.tsx`
   - `components/task-details.tsx`

6. **Update Inngest**: Handle git push if needed in `lib/inngest/functions/execute-task.ts`

## Testing

### Manual Testing

Test each provider with a simple task:

```
Repository: https://github.com/vercel/next.js
Prompt: "Add a comment to the README explaining what Next.js is"
Agent: Claude Code
Sandbox: [Your Provider]
```

### What to Verify

- ✅ Sandbox creation succeeds
- ✅ Repository cloning works
- ✅ Branch creation/checkout works
- ✅ Dependencies install correctly
- ✅ Agent CLI installs
- ✅ Agent execution completes
- ✅ Task logs are detailed
- ✅ Sandbox cleanup works
- ✅ Inngest orchestration handles reconnection

### Known Limitations

1. **Long-Running Tasks**:
   - E2B/Daytona: Max 30 minutes per agent execution
   - Can be increased via timeout parameters

2. **Resource Limits**:
   - Docker: Limited by host machine resources
   - Cloud providers: Limited by plan/pricing tier

## Troubleshooting

### "Sandbox not found after reconnection"

- Check that sandbox ID is stored in `sandbox.metadata`
- Verify API credentials are correct
- Ensure sandbox hasn't been auto-deleted (check provider retention policy)

### "Command execution timeout"

- Increase timeout in provider's execute command
- Check if sandbox has sufficient resources
- Verify network connectivity for cloud providers

### "Git operations failing"

- Verify `GITHUB_TOKEN` has correct permissions
- Check if repository URL is accessible
- For Docker: Ensure git is installed in container

### "Module not found" errors

- Run `pnpm install` to ensure all SDK packages are installed
- For cloud providers: Check API key is valid
- For Docker: Ensure Docker Desktop is running

## Performance Tips

1. **Daytona for Development**: Fastest creation time for rapid iteration
2. **Docker for Testing**: No cloud costs, predictable performance
3. **Vercel for Production**: Full observability and automatic scaling
4. **E2B for Code Interpretation**: Optimized for running untrusted code

## Future Improvements

- [x] Implement git push for Docker provider
- [x] Implement git push for E2B provider
- [x] Implement git push for Daytona provider
- [ ] Add provider-specific resource configuration
- [ ] Support for custom Docker images
- [ ] Parallel sandbox execution for batch tasks
- [ ] Sandbox snapshots/checkpoints
- [ ] Provider health monitoring dashboard

## Resources

- [Vercel Sandbox Docs](https://vercel.com/docs/vercel-sandbox)
- [E2B Documentation](https://e2b.dev/docs)
- [Daytona Documentation](https://www.daytona.io/docs)
- [Docker SDK for Node.js](https://github.com/apocas/dockerode)
- [Inngest Documentation](https://www.inngest.com/docs)
