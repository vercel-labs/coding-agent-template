# Sandbox Agent "Stuck" Behavior - Implementation Plan

## Executive Summary

This plan addresses the 5 root causes identified in `SANDBOX_AGENT_STUCK_REPORT.md`. The fixes are designed to be implemented incrementally with clear dependencies, testing checkpoints, and rollback strategies.

**Key Principle**: Make stop requests authoritative - when a user stops a task or timeout occurs, the sandbox MUST terminate and no background work should continue.

---

## Fix 1: DB-Backed Sandbox Termination

### Problem
Stop requests depend on in-memory `activeSandboxes` map, which is scoped to a single serverless invocation. If a different Lambda handles the stop request, the sandbox isn't found and continues running.

### Solution
Look up `sandboxId` from database and use `Sandbox.get()` + `shutdown()` for cross-invocation termination.

### Files to Modify

**1. `app/api/tasks/[taskId]/route.ts` (PATCH /stop endpoint)**
- Current: `killSandbox(taskId)` → only works if sandbox in local map
- New: Fetch `task.sandboxId` from DB → `Sandbox.get()` → `shutdownSandbox()`

**2. `lib/mcp/tools/stop-task.ts`**
- Same changes as REST endpoint

**3. `lib/sandbox/sandbox-registry.ts`**
- Mark `killSandbox()` as deprecated
- Create new `killSandboxById()` function that takes `sandboxId` string
- Keep existing registry for backward compatibility

### Implementation Pattern

```typescript
// New helper in lib/sandbox/git.ts or lib/sandbox/sandbox-operations.ts
export async function shutdownSandboxById(
  sandboxId: string,
  logger?: TaskLogger
): Promise<{ success: boolean; error?: string }> {
  try {
    const sandbox = await Sandbox.get({
      sandboxId,
      teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: process.env.SANDBOX_VERCEL_TOKEN!,
    })

    await shutdownSandbox(sandbox)
    if (logger) await logger.info('Sandbox terminated successfully')
    return { success: true }
  } catch (error) {
    // Handle 410 Gone (sandbox already terminated) as success
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { status?: number } }).response
      if (response?.status === 410) {
        if (logger) await logger.info('Sandbox already terminated')
        return { success: true }
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (logger) await logger.error('Failed to terminate sandbox')
    return { success: false, error: errorMessage }
  }
}

// Usage in app/api/tasks/[taskId]/route.ts
if (body.action === 'stop') {
  // Update status first
  await db.update(tasks)
    .set({ status: 'stopped', error: 'Task was stopped by user', updatedAt: new Date() })
    .where(eq(tasks.id, taskId))

  // Terminate sandbox using database sandboxId
  if (existingTask.sandboxId) {
    const shutdownResult = await shutdownSandboxById(existingTask.sandboxId, logger)
    if (!shutdownResult.success) {
      await logger.error('Warning: Sandbox termination failed but task marked as stopped')
    }
  } else {
    // Fallback to in-memory registry (for tasks created before sandboxId was stored)
    await killSandbox(taskId)
  }

  await logger.error('Task stopped by user')
  return NextResponse.json({ message: 'Task stopped successfully' })
}
```

### Database Schema Changes
**None required** - `tasks.sandboxId` already exists (line 98 in schema.ts)

### Fallback Behavior
1. Try `Sandbox.get()` with `sandboxId` from database
2. If 410 Gone → treat as success (already terminated)
3. If 404 Not Found → try in-memory registry as fallback
4. If all fail → log warning but mark task as stopped (user intent honored)

### Testing Checklist
- ✓ Stop task during sandbox creation (before sandboxId stored)
- ✓ Stop task during agent execution (sandboxId exists)
- ✓ Stop request from different serverless instance than creator
- ✓ Stop already-stopped task (410 response)
- ✓ Verify sandbox actually terminates (check Vercel dashboard)

---

## Fix 2: Cancellation Checks in Agent Loops

### Problem
Agent execution loops (Claude, Cursor) have no mechanism to detect that a task was stopped. They continue executing even after `task.status = 'stopped'`.

### Solution
Add periodic polling of `task.status` inside agent wait loops. If `status === 'stopped'`, terminate CLI process and return early.

### Files to Modify

**1. `lib/sandbox/agents/claude.ts`**
- Lines 548-560: Add cancellation check inside while loop
- After detecting stopped: Kill detached process, return cancelled result

**2. `lib/sandbox/agents/cursor.ts`**
- Lines 479-493: Add cancellation check inside while loop
- After detecting stopped: Kill detached process, return cancelled result

**3. `lib/sandbox/agents/codex.ts`, `copilot.ts`, `gemini.ts`, `opencode.ts`**
- Apply same pattern to any agents with wait loops

**4. `lib/tasks/process-task.ts`**
- Already has `isTaskStopped()` helper (line 230)
- No changes needed - this function will be reused by agents

**5. `lib/sandbox/agents/index.ts`**
- Pass `taskId` to all agents that need cancellation checks
- Already passed to claude and cursor (lines 82, 118)

### Implementation Pattern

```typescript
// In lib/sandbox/agents/claude.ts (executeClaudeInSandbox)

// Store process reference for potential termination
let agentProcess: any = null

// Execute Claude CLI with streaming
agentProcess = await sandbox.runCommand({
  cmd: 'sh',
  args: ['-c', fullCommand],
  sudo: false,
  detached: true,
  cwd: PROJECT_DIR,
  stdout: captureStdout,
  stderr: captureStderr,
})

await logger.info('Claude command started, monitoring for completion and cancellation')

// Wait for completion with timeout AND cancellation checks
const MAX_WAIT_TIME = 5 * 60 * 1000 // 5 minutes
const startWaitTime = Date.now()
const CHECK_INTERVAL_MS = 2000 // Check every 2 seconds

while (!isCompleted) {
  await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS))

  // Check if task was stopped
  if (taskId) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (task?.status === 'stopped') {
      await logger.info('Task cancellation detected, terminating agent')

      // Best effort: try to kill the detached process
      // Note: Detached processes are hard to kill - this is best-effort
      try {
        if (agentProcess && typeof agentProcess.kill === 'function') {
          agentProcess.kill('SIGTERM')
        }
      } catch (killError) {
        console.error('Failed to kill agent process')
      }

      return {
        success: false,
        error: 'Task was stopped by user during agent execution',
        cliName: 'claude',
        changesDetected: false,
        cancelled: true,
      }
    }
  }

  // Check timeout
  const elapsed = Date.now() - startWaitTime
  if (elapsed > MAX_WAIT_TIME) {
    await logger.info('Agent wait timeout reached')
    break
  }

  // Log progress every 30 seconds
  if (elapsed % 30000 < CHECK_INTERVAL_MS) {
    await logger.info('Waiting for agent completion')
  }
}
```

### Interface Changes

**AgentExecutionResult** (lib/sandbox/types.ts)
```typescript
export interface AgentExecutionResult {
  success: boolean
  output?: string
  error?: string
  agentResponse?: string
  cliName: string
  changesDetected: boolean
  sessionId?: string
  cancelled?: boolean  // NEW: indicates task was cancelled mid-execution
}
```

### Propagation Strategy

1. **Agent layer** (`claude.ts`, `cursor.ts`): Poll database every 2s, return early with `cancelled: true`
2. **Execution layer** (`process-task.ts`): Check `agentResult.cancelled`, skip Git push, shutdown sandbox
3. **API layer**: Task status already set to 'stopped', no further action needed

### Limitations

**Detached processes are hard to kill**:
- `sandbox.runCommand({ detached: true })` returns immediately
- Process runs in background; we don't have direct process ID
- Terminating sandbox is the only reliable way to stop execution
- Cancellation check ensures we don't push partial work to Git

**Why this still helps**:
- Prevents Git commit/push of partial work
- Prevents "completed" status when user wanted "stopped"
- Combined with Fix #1 (sandbox termination), ensures full cleanup

### Testing Checklist
- ✓ Stop task during agent execution (before any output)
- ✓ Stop task during agent execution (mid-stream)
- ✓ Verify no Git push happens after cancellation
- ✓ Verify task logs show "Task cancellation detected"
- ✓ Check performance impact of 2s polling interval

---

## Fix 3: Sandbox Health Probe

### Problem
When resuming a sandbox (keepAlive + follow-up), no health check is performed. If sandbox expired (410 Gone), CLI installation commands fail and system tries to reinstall instead of recreating sandbox.

### Solution
Add lightweight health probe before resuming sandbox. On 410 error, clear `agentSessionId` and recreate sandbox.

### Files to Modify

**1. `lib/tasks/continue-task.ts` (NEW FILE)**
- Extract continuation logic from REST/MCP endpoints
- Add health check before agent execution
- Handle 410 → recreate sandbox flow

**2. `app/api/tasks/[taskId]/continue/route.ts`**
- Delegate to `lib/tasks/continue-task.ts`

**3. `lib/mcp/tools/continue-task.ts`**
- Delegate to `lib/tasks/continue-task.ts`

**4. `lib/sandbox/commands.ts`**
- Add `healthCheckSandbox(sandbox)` helper

### Implementation Pattern

```typescript
// New file: lib/sandbox/health.ts
export async function healthCheckSandbox(
  sandbox: Sandbox,
  logger: TaskLogger
): Promise<{ healthy: boolean; shouldRecreate: boolean; error?: string }> {
  try {
    // Lightweight command to test sandbox responsiveness
    const result = await sandbox.runCommand({
      cmd: 'echo',
      args: ['sandbox-health-ok'],
      timeoutMs: 5000, // 5 second timeout
    })

    if (result.exitCode === 0) {
      await logger.info('Sandbox health check passed')
      return { healthy: true, shouldRecreate: false }
    } else {
      await logger.info('Sandbox health check failed')
      return { healthy: false, shouldRecreate: true }
    }
  } catch (error) {
    // Check for 410 Gone (sandbox expired/terminated)
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { status?: number } }).response
      if (response?.status === 410) {
        await logger.info('Sandbox expired, recreation required')
        return { healthy: false, shouldRecreate: true, error: '410 Gone' }
      }
    }

    // Other errors (network, timeout, etc.)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await logger.error('Sandbox health check failed')
    return { healthy: false, shouldRecreate: true, error: errorMessage }
  }
}

// In lib/tasks/continue-task.ts (new file)
export async function continueTask(input: {
  taskId: string
  message: string
  userId: string
  githubToken?: string
  githubUser?: { username: string; name: string | null; email: string | null } | null
  apiKeys?: Record<string, string>
}): Promise<void> {
  const logger = createTaskLogger(input.taskId)

  // Fetch existing task
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)
  if (!task) throw new Error('Task not found')

  let sandbox: Sandbox | null = null
  let shouldRecreate = false

  // If task has keepAlive and sandboxId, try to reconnect
  if (task.keepAlive && task.sandboxId) {
    try {
      sandbox = await Sandbox.get({
        sandboxId: task.sandboxId,
        teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
        projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
        token: process.env.SANDBOX_VERCEL_TOKEN!,
      })

      // Health check
      const healthCheck = await healthCheckSandbox(sandbox, logger)
      if (!healthCheck.healthy) {
        shouldRecreate = true
        await logger.info('Sandbox unhealthy, will recreate')
      } else {
        await logger.info('Reconnected to existing sandbox')
      }
    } catch (error) {
      shouldRecreate = true
      await logger.info('Failed to reconnect to sandbox, will recreate')
    }
  } else {
    shouldRecreate = true
  }

  // Recreate sandbox if needed
  if (shouldRecreate) {
    await logger.info('Creating new sandbox for continuation')

    // Clear session ID since we're recreating
    await db.update(tasks).set({ agentSessionId: null }).where(eq(tasks.id, input.taskId))

    // Create new sandbox (reuse creation logic)
    const sandboxResult = await createSandbox(
      {
        taskId: input.taskId,
        repoUrl: task.repoUrl!,
        githubToken: input.githubToken,
        // ... other config from original task
        preDeterminedBranchName: task.branchName || undefined,
      },
      logger
    )

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error || 'Failed to recreate sandbox')
    }

    sandbox = sandboxResult.sandbox!

    // Update sandboxId in database
    await db.update(tasks)
      .set({ sandboxId: sandbox.sandboxId })
      .where(eq(tasks.id, input.taskId))
  }

  if (!sandbox) throw new Error('No sandbox available')

  // Execute agent with isResumed=true only if we didn't recreate
  const isResumed = !shouldRecreate
  const sessionId = isResumed ? task.agentSessionId || undefined : undefined

  const agentResult = await executeAgentInSandbox(
    sandbox,
    input.message,
    task.selectedAgent as AgentType,
    logger,
    task.selectedModel || undefined,
    [], // MCP servers
    undefined, // onCancellationCheck
    input.apiKeys,
    isResumed,
    sessionId,
    input.taskId
  )

  // ... rest of continuation logic (Git push, cleanup)
}
```

### State Transitions

```
Scenario 1: Healthy Sandbox Resume
keepAlive=true + sandboxId exists → Sandbox.get() → health check passes
→ Execute with isResumed=true, agentSessionId preserved
→ Push changes, keep sandbox alive

Scenario 2: Expired Sandbox Recreation
keepAlive=true + sandboxId exists → Sandbox.get() → health check 410
→ Clear agentSessionId → createSandbox() → Execute with isResumed=false
→ Push changes, store new sandboxId

Scenario 3: First Continuation (No Sandbox)
keepAlive=false OR no sandboxId → Create new sandbox
→ Execute with isResumed=false
→ Push changes, store sandboxId if keepAlive=true
```

### Testing Checklist
- ✓ Continue task with healthy sandbox (session resumes)
- ✓ Continue task with expired sandbox (recreates + new session)
- ✓ Continue task that wasn't kept alive (creates new sandbox)
- ✓ Verify 410 errors don't trigger CLI reinstallation
- ✓ Health check timeout doesn't block execution

---

## Fix 4: Activity-Based Timeout

### Problem
Agent wait loop uses fixed 5-minute timeout. If agent is stuck producing no output, we wait the full 5 minutes before declaring failure.

### Solution
Track timestamp of last output. If no output for 60 seconds, treat as inactivity timeout and terminate.

### Files to Modify

**1. `lib/sandbox/agents/claude.ts`**
- Track `lastOutputTime` in streaming capture
- Check inactivity timeout in wait loop
- Configurable via env var `AGENT_INACTIVITY_TIMEOUT_MS`

**2. `lib/sandbox/agents/cursor.ts`**
- Same pattern as Claude

**3. Environment Variables (optional)**
- `AGENT_INACTIVITY_TIMEOUT_MS` - default 60000 (60 seconds)
- `AGENT_MAX_WAIT_TIME_MS` - default 300000 (5 minutes)

### Implementation Pattern

```typescript
// In lib/sandbox/agents/claude.ts

const INACTIVITY_TIMEOUT_MS = parseInt(
  process.env.AGENT_INACTIVITY_TIMEOUT_MS || '60000',
  10
)
const MAX_WAIT_TIME_MS = parseInt(
  process.env.AGENT_MAX_WAIT_TIME_MS || '300000',
  10
)

let lastOutputTime = Date.now()
let isCompleted = false

const captureStdout = new Writable({
  write(chunk, _encoding, callback) {
    const text = chunk.toString()

    // Update last output time on any chunk received
    lastOutputTime = Date.now()

    // ... existing JSON parsing logic ...

    callback()
  },
})

// Wait for completion with timeout AND inactivity detection
const startWaitTime = Date.now()
const CHECK_INTERVAL_MS = 2000

while (!isCompleted) {
  await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS))

  const now = Date.now()
  const totalElapsed = now - startWaitTime
  const inactivityElapsed = now - lastOutputTime

  // Check for inactivity timeout
  if (inactivityElapsed > INACTIVITY_TIMEOUT_MS) {
    await logger.error('Agent execution timed out due to inactivity')
    await logger.info('No output received for extended period')

    // Terminate the process (best effort)
    try {
      if (agentProcess && typeof agentProcess.kill === 'function') {
        agentProcess.kill('SIGTERM')
      }
    } catch (killError) {
      console.error('Failed to kill inactive agent process')
    }

    return {
      success: false,
      error: `Agent execution stalled - no output for ${INACTIVITY_TIMEOUT_MS / 1000}s`,
      cliName: 'claude',
      changesDetected: false,
    }
  }

  // Check for absolute timeout
  if (totalElapsed > MAX_WAIT_TIME_MS) {
    await logger.error('Agent execution reached maximum time limit')
    break
  }

  // Cancellation check (from Fix #2)
  // ...

  // Log progress
  if (totalElapsed % 30000 < CHECK_INTERVAL_MS) {
    const inactivitySeconds = Math.floor(inactivityElapsed / 1000)
    await logger.info('Waiting for agent completion')
    // Don't log inactivity time to avoid dynamic values in logs
  }
}
```

### Configuration

**Default Values**:
- Inactivity timeout: 60 seconds (no output → fail)
- Absolute timeout: 5 minutes (regardless of output)
- Check interval: 2 seconds (polling frequency)

**Tuning Considerations**:
- Longer tasks (e.g., large refactors): May need higher inactivity timeout
- Short tasks (e.g., README updates): Current values sufficient
- Production: Monitor task logs for false positives

### Testing Checklist
- ✓ Agent produces output continuously → completes normally
- ✓ Agent stalls (no output for 60s) → inactivity timeout triggers
- ✓ Agent takes 3 minutes but outputs every 30s → completes normally
- ✓ Verify timeout errors logged correctly
- ✓ Test with different AGENT_INACTIVITY_TIMEOUT_MS values

---

## Fix 5: Authoritative Timeouts

### Problem
Task timeout uses `Promise.race()` without cleanup. When timeout wins, the original `processTask()` continues executing in background, potentially pushing changes after task is marked as error.

### Solution
Ensure timeout handler actively terminates sandbox and sets a flag that `processTask()` checks to prevent Git operations.

### Files to Modify

**1. `lib/tasks/process-task.ts`**
- Make timeout handler call `shutdownSandboxById()`
- Add global timeout flag that prevents Git push
- Check flag before `pushChangesToBranch()`

**2. `lib/sandbox/git.ts`**
- No changes (already has `shutdownSandbox()`)

### Implementation Pattern

```typescript
// In lib/tasks/process-task.ts

// Track timeout state per task
const taskTimeoutFlags = new Map<string, boolean>()

function markTaskAsTimedOut(taskId: string) {
  taskTimeoutFlags.set(taskId, true)
}

function isTaskTimedOut(taskId: string): boolean {
  return taskTimeoutFlags.get(taskId) === true
}

function clearTimeoutFlag(taskId: string) {
  taskTimeoutFlags.delete(taskId)
}

export async function processTaskWithTimeout(input: TaskProcessingInput): Promise<void> {
  const TASK_TIMEOUT_MS = input.maxDuration * 60 * 1000

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(async () => {
      // Mark task as timed out BEFORE rejecting
      markTaskAsTimedOut(input.taskId)

      // Log timeout
      const timeoutLogger = createTaskLogger(input.taskId)
      await timeoutLogger.error('Task execution timed out')

      // Terminate sandbox immediately to stop background work
      try {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)
        if (task?.sandboxId) {
          await shutdownSandboxById(task.sandboxId, timeoutLogger)
          await timeoutLogger.info('Sandbox terminated due to timeout')
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup sandbox during timeout')
      }

      // Update task status
      await db.update(tasks)
        .set({
          status: 'error',
          error: `Task execution timed out after ${input.maxDuration} minutes`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, input.taskId))

      reject(new Error(`Task execution timed out after ${input.maxDuration} minutes`))
    }, TASK_TIMEOUT_MS)
  })

  try {
    await Promise.race([processTask(input), timeoutPromise])
    clearTimeoutFlag(input.taskId)
  } catch (error: unknown) {
    // Don't re-log if timeout handler already logged
    if (!isTaskTimedOut(input.taskId)) {
      const logger = createTaskLogger(input.taskId)
      await logger.error('Task processing failed')
      await logger.updateStatus('error')
    }
    clearTimeoutFlag(input.taskId)
  } finally {
    // Always clean up flag
    clearTimeoutFlag(input.taskId)
  }
}

async function processTask(input: TaskProcessingInput): Promise<void> {
  // ... existing logic ...

  if (agentResult.success) {
    // Check timeout flag before Git operations
    if (isTaskTimedOut(input.taskId)) {
      await logger.info('Skipping Git push due to timeout')
      return // Exit early, don't push partial work
    }

    // Generate commit message
    const commitMessage = await generateCommitMessage(...)

    // Check timeout flag again (in case it happened during commit message generation)
    if (isTaskTimedOut(input.taskId)) {
      await logger.info('Skipping Git push due to timeout')
      return
    }

    // Push changes
    const pushResult = await pushChangesToBranch(sandbox!, branchName!, commitMessage, logger)

    // ... rest of completion logic
  }
}
```

### Race Condition Prevention

**Scenario: Timeout during Git push**
1. Timeout triggers → `markTaskAsTimedOut(taskId)` → `shutdownSandbox()`
2. `processTask()` is mid-push → sandbox termination kills Git operation
3. Git operation fails → error logged → task already marked as error
4. No duplicate status update, no orphaned work

**Scenario: Timeout after completion**
1. Agent completes → Git push succeeds → task marked as completed
2. Timeout fires 1 second later → checks task status
3. Task already completed → timeout handler skips (add check in timeout handler)

### Enhanced Timeout Handler

```typescript
setTimeout(async () => {
  // Check current task status before timing out
  const [currentTask] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)

  // Don't timeout if task already completed/stopped
  if (currentTask?.status === 'completed' || currentTask?.status === 'stopped') {
    return // Race condition: task finished just before timeout
  }

  // Mark as timed out and proceed with cleanup
  markTaskAsTimedOut(input.taskId)
  // ... rest of timeout handler
}, TASK_TIMEOUT_MS)
```

### Testing Checklist
- ✓ Task times out during sandbox creation → no Git push
- ✓ Task times out during agent execution → sandbox terminated, no Git push
- ✓ Task times out during Git push → operation killed, task marked error
- ✓ Task completes 1s before timeout → timeout handler skips
- ✓ Multiple tasks running concurrently → correct task timed out

---

## Implementation Order & Dependencies

### Phase 1: Foundation (Week 1)
**Goal**: Make stop requests work across serverless invocations

1. **Fix 1: DB-Backed Termination** ✅ NO DEPENDENCIES
   - Create `shutdownSandboxById()` helper
   - Update `/api/tasks/[taskId]/route.ts` (stop endpoint)
   - Update `lib/mcp/tools/stop-task.ts`
   - Test: Stop task from different Lambda invocation

### Phase 2: Execution Control (Week 2)
**Goal**: Prevent continued execution after stop/timeout

2. **Fix 2: Cancellation Checks** ⚠️ DEPENDS ON: Fix 1
   - Add cancellation polling to `claude.ts`, `cursor.ts`
   - Update `AgentExecutionResult` type with `cancelled` field
   - Handle `cancelled` in `process-task.ts`
   - Test: Stop task mid-execution, verify no Git push

3. **Fix 5: Authoritative Timeouts** ⚠️ DEPENDS ON: Fix 1, Fix 2
   - Add timeout flag system to `process-task.ts`
   - Make timeout handler call `shutdownSandboxById()`
   - Add timeout checks before Git operations
   - Test: Task times out, verify sandbox terminated and no Git push

### Phase 3: Reliability (Week 3)
**Goal**: Handle sandbox expiration and stuck execution

4. **Fix 3: Sandbox Health Probe** ⚠️ DEPENDS ON: Fix 1
   - Create `healthCheckSandbox()` helper
   - Extract `continueTask()` shared logic
   - Add health check before resume
   - Handle 410 → recreate flow
   - Test: Continue task with expired sandbox

5. **Fix 4: Activity-Based Timeout** ⚠️ DEPENDS ON: Fix 2
   - Add `lastOutputTime` tracking to agent streaming
   - Add inactivity check to wait loop
   - Add env var configuration
   - Test: Agent stalls (no output), verify timeout triggers

### Phase 4: Integration & Validation (Week 4)
**Goal**: End-to-end testing and documentation

6. **Integration Testing**
   - Test all 5 fixes together
   - Verify no regressions in normal flow
   - Load testing with concurrent tasks
   - Verify Vercel dashboard shows sandboxes terminating

7. **Documentation & Monitoring**
   - Update AGENTS.md with new patterns
   - Add timeout configuration guide
   - Document debugging procedures
   - Add Datadog/CloudWatch alerts for stuck sandboxes

---

## Code Quality Requirements

### Before Each Fix
1. ✓ Read affected files with Read tool
2. ✓ Run `pnpm type-check` to verify types
3. ✓ Run `pnpm lint` to check for errors
4. ✓ Verify all log statements use static strings (no dynamic values)

### After Each Fix
1. ✓ Run `pnpm format` to format code
2. ✓ Run `pnpm type-check` again
3. ✓ Run `pnpm lint` again
4. ✓ Manual testing with test task
5. ✓ Git commit with descriptive message

---

## Testing Strategy

### Unit Tests (Per Fix)
Each fix should have focused tests:
- **Fix 1**: Mock DB queries, verify `Sandbox.get()` called with correct sandboxId
- **Fix 2**: Mock task status changes, verify early return on cancellation
- **Fix 3**: Mock health check responses (200, 410), verify recreation logic
- **Fix 4**: Mock streaming output, verify inactivity detection
- **Fix 5**: Mock timeout, verify sandbox termination before Git push

### Integration Tests (Post-Implementation)
End-to-end scenarios:
1. **Normal Flow**: Create task → execute → complete → verify Git push
2. **Stop During Execution**: Create task → stop mid-agent → verify no Git push
3. **Timeout**: Create task with 1-minute timeout → trigger timeout → verify termination
4. **Resume Healthy**: Create task with keepAlive → continue → verify session resumed
5. **Resume Expired**: Create task with keepAlive → wait 1 hour → continue → verify recreation
6. **Stuck Agent**: Create task that produces no output → verify inactivity timeout

### Manual Testing Checklist
Before production deployment:
- [ ] Create task and let it complete normally
- [ ] Create task and stop it during sandbox creation
- [ ] Create task and stop it during agent execution
- [ ] Create task and stop it during Git push
- [ ] Create task with keepAlive, verify sandbox persists
- [ ] Continue task with healthy sandbox, verify session resume
- [ ] Continue task after 1 hour (sandbox expired), verify recreation
- [ ] Create task with prompt that causes agent to stall, verify timeout
- [ ] Verify Vercel dashboard shows correct sandbox lifecycle
- [ ] Check database for orphaned sandboxes (sandboxId but no running instance)

---

## Rollback Strategy

### Per-Fix Rollback
Each fix is independent and can be rolled back individually:

**Fix 1 Rollback**: Revert stop endpoint to use `killSandbox(taskId)` only
**Fix 2 Rollback**: Remove cancellation checks from agent loops
**Fix 3 Rollback**: Remove health check, allow 410 errors to propagate
**Fix 4 Rollback**: Remove inactivity tracking, use fixed timeout
**Fix 5 Rollback**: Remove timeout flag system, revert to Promise.race only

### Feature Flags (Optional)
Add env vars to enable/disable each fix:
```bash
ENABLE_DB_BACKED_STOP=true
ENABLE_CANCELLATION_CHECKS=true
ENABLE_HEALTH_PROBE=true
ENABLE_INACTIVITY_TIMEOUT=true
ENABLE_AUTHORITATIVE_TIMEOUT=true
```

### Emergency Rollback
If critical issue found in production:
1. Set feature flag to `false` in Vercel dashboard
2. Redeploy (Next.js will use env vars)
3. Investigate issue
4. Fix and re-enable

---

## Monitoring & Metrics

### New Metrics to Track
1. **Sandbox Termination Success Rate**: % of stop requests that successfully terminate sandbox
2. **Cancellation Response Time**: Time from stop request to agent termination
3. **Health Check Failure Rate**: % of resume attempts that require recreation
4. **Inactivity Timeout Rate**: % of tasks that timeout due to inactivity vs. absolute timeout
5. **Timeout Cleanup Success Rate**: % of timeouts that successfully terminate sandbox

### Alerts to Configure
1. **High Stop Failure Rate**: > 10% of stop requests fail to terminate sandbox
2. **High Inactivity Timeout Rate**: > 20% of tasks timing out due to inactivity (may indicate agent issues)
3. **Orphaned Sandboxes**: sandboxId in DB but no active sandbox in Vercel (24h+ old)

### Logging Enhancements
Add structured logging for debugging:
```typescript
console.log(JSON.stringify({
  event: 'sandbox_termination',
  taskId,
  sandboxId,
  method: 'db_backed', // or 'in_memory'
  success: true,
  duration_ms: 1234,
  error: null,
}))
```

---

## Risk Assessment

### Low Risk
- **Fix 1**: Adding DB lookup is safe; falls back to in-memory if needed
- **Fix 3**: Health check is defensive; 410 handling prevents retry loops

### Medium Risk
- **Fix 2**: Cancellation polling adds 2s delay to stop response; may slow down tight loops
- **Fix 4**: Aggressive inactivity timeout may kill legitimate slow agents

### High Risk
- **Fix 5**: Timeout flag system requires careful synchronization; race conditions possible

### Mitigation
1. **Staged Rollout**: Deploy fixes 1-3 first (low/medium risk), monitor for 1 week
2. **Canary Testing**: Test fixes 4-5 on 10% of traffic before full rollout
3. **Feature Flags**: Allow instant rollback without redeployment
4. **Logging**: Add detailed logs for all new code paths
5. **Alerting**: Monitor sandbox lifecycle metrics closely

---

## Success Criteria

### Fix 1 Success
- ✓ Stop requests work across different serverless invocations
- ✓ Sandbox appears as terminated in Vercel dashboard within 30s
- ✓ No "sandbox not found" errors in logs

### Fix 2 Success
- ✓ Stopped tasks don't push Git changes
- ✓ Logs show "Task cancellation detected" within 2-4s of stop request
- ✓ Agent execution terminates (or sandbox kills it)

### Fix 3 Success
- ✓ 410 errors during resume trigger recreation, not CLI reinstall
- ✓ Session resumption works when sandbox is healthy
- ✓ No increase in task failure rate

### Fix 4 Success
- ✓ Stuck agents (no output) timeout within 60s
- ✓ Active agents (continuous output) run for full duration
- ✓ Inactivity timeout rate < 5% in production

### Fix 5 Success
- ✓ Timeouts terminate sandbox within 10s
- ✓ No Git pushes after timeout
- ✓ No "completed" status on timed-out tasks

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Approve implementation order** and timeline
3. **Set up monitoring infrastructure** (metrics, alerts, dashboards)
4. **Create feature flag system** (optional but recommended)
5. **Begin Phase 1** (Fix 1: DB-Backed Termination)
6. **Weekly check-ins** to review progress and adjust plan

---

## Questions for Review

1. **Timeout Values**: Are 60s inactivity / 5min absolute timeouts reasonable?
2. **Polling Frequency**: Is 2s cancellation check interval acceptable?
3. **Health Check**: Should we add health check to initial sandbox creation too?
4. **Monitoring**: What metrics platform should we use (Datadog, CloudWatch, custom)?
5. **Feature Flags**: Should we implement flags or deploy directly?

---

## Appendix: File Reference

### Files Modified (Total: 11)

**Core Logic**:
- `lib/sandbox/git.ts` - Add `shutdownSandboxById()`
- `lib/sandbox/health.ts` - NEW - Health check logic
- `lib/sandbox/agents/claude.ts` - Cancellation + inactivity
- `lib/sandbox/agents/cursor.ts` - Cancellation + inactivity
- `lib/sandbox/types.ts` - Add `cancelled` field
- `lib/tasks/process-task.ts` - Timeout flag system
- `lib/tasks/continue-task.ts` - NEW - Shared continuation logic

**API Endpoints**:
- `app/api/tasks/[taskId]/route.ts` - DB-backed stop
- `lib/mcp/tools/stop-task.ts` - DB-backed stop
- `app/api/tasks/[taskId]/continue/route.ts` - Delegate to shared logic
- `lib/mcp/tools/continue-task.ts` - Delegate to shared logic

### Files for Reference (No Changes)
- `lib/sandbox/sandbox-registry.ts` - Keep for backward compat
- `lib/sandbox/commands.ts` - Used by health check
- `lib/db/schema.ts` - Already has sandboxId field
- `lib/utils/task-logger.ts` - Used throughout

---

**End of Implementation Plan**
