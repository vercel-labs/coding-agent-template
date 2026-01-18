# Sandbox Fix - Quick Reference Guide

**For developers implementing the 5 sandbox fixes. See full plan in `SANDBOX_FIX_IMPLEMENTATION_PLAN.md`.**

---

## Fix 1: DB-Backed Sandbox Termination

### What to Change
Replace in-memory `killSandbox(taskId)` with database lookup → `Sandbox.get()` → `shutdownSandbox()`

### New Helper Function
**File**: `lib/sandbox/git.ts` (or new `lib/sandbox/operations.ts`)

```typescript
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
    if (error?.response?.status === 410) {
      if (logger) await logger.info('Sandbox already terminated')
      return { success: true }
    }

    if (logger) await logger.error('Failed to terminate sandbox')
    return { success: false, error: error.message }
  }
}
```

### Update Stop Endpoints

**File**: `app/api/tasks/[taskId]/route.ts`

```typescript
// In PATCH handler, body.action === 'stop'
if (existingTask.sandboxId) {
  await shutdownSandboxById(existingTask.sandboxId, logger)
} else {
  // Fallback for old tasks
  await killSandbox(taskId)
}
```

**File**: `lib/mcp/tools/stop-task.ts` - Same pattern

### Testing
```bash
# Terminal 1: Start a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Cookie: session=..." \
  -d '{"prompt":"Fix README","repoUrl":"..."}'

# Terminal 2: Stop from different process (simulates different Lambda)
curl -X PATCH http://localhost:3000/api/tasks/TASK_ID \
  -H "Cookie: session=..." \
  -d '{"action":"stop"}'

# Verify: Check Vercel dashboard, sandbox should be terminated
```

---

## Fix 2: Cancellation Checks in Agent Loops

### What to Change
Add polling inside agent wait loops to detect `task.status === 'stopped'`

### Pattern for All Agents

**Files**: `lib/sandbox/agents/claude.ts`, `cursor.ts`, etc.

```typescript
// Before executeAgentInSandbox returns, in the wait loop:
const CHECK_INTERVAL_MS = 2000

while (!isCompleted) {
  await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS))

  // NEW: Check if task was stopped
  if (taskId) {
    const [task] = await db.select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)

    if (task?.status === 'stopped') {
      await logger.info('Task cancellation detected')

      // Best effort: kill process
      try {
        if (agentProcess?.kill) agentProcess.kill('SIGTERM')
      } catch {}

      return {
        success: false,
        error: 'Task was stopped by user',
        cliName: 'claude',
        changesDetected: false,
        cancelled: true,  // NEW FIELD
      }
    }
  }

  // Existing timeout check
  const elapsed = Date.now() - startWaitTime
  if (elapsed > MAX_WAIT_TIME) break

  // Existing progress logging
  if (elapsed % 30000 < CHECK_INTERVAL_MS) {
    await logger.info('Waiting for agent completion')
  }
}
```

### Update Type Definition

**File**: `lib/sandbox/types.ts`

```typescript
export interface AgentExecutionResult {
  success: boolean
  output?: string
  error?: string
  agentResponse?: string
  cliName: string
  changesDetected: boolean
  sessionId?: string
  cancelled?: boolean  // NEW: Indicates mid-execution cancellation
}
```

### Handle Cancellation in Task Processing

**File**: `lib/tasks/process-task.ts`

```typescript
// After executeAgentInSandbox
if (agentResult.cancelled) {
  await logger.info('Agent execution was cancelled, skipping Git operations')
  // Don't push changes
  // Shutdown sandbox (already handled by Fix 1)
  return
}

if (agentResult.success) {
  // Proceed with Git push
}
```

### Testing
```bash
# Start task with long-running prompt
curl -X POST ... -d '{"prompt":"Refactor entire codebase",...}'

# Wait 10 seconds, then stop
sleep 10
curl -X PATCH .../tasks/TASK_ID -d '{"action":"stop"}'

# Verify logs show "Task cancellation detected" within 2-4s
# Verify no Git push occurred
```

---

## Fix 3: Sandbox Health Probe

### What to Change
Before resuming sandbox, run health check. On 410 error, recreate sandbox and clear session.

### New Health Check Helper

**File**: `lib/sandbox/health.ts` (NEW FILE)

```typescript
import { Sandbox } from '@vercel/sandbox'
import { TaskLogger } from '@/lib/utils/task-logger'

export async function healthCheckSandbox(
  sandbox: Sandbox,
  logger: TaskLogger
): Promise<{ healthy: boolean; shouldRecreate: boolean; error?: string }> {
  try {
    const result = await sandbox.runCommand({
      cmd: 'echo',
      args: ['health-ok'],
      timeoutMs: 5000,
    })

    if (result.exitCode === 0) {
      await logger.info('Sandbox health check passed')
      return { healthy: true, shouldRecreate: false }
    }

    await logger.info('Sandbox health check failed')
    return { healthy: false, shouldRecreate: true }
  } catch (error) {
    if (error?.response?.status === 410) {
      await logger.info('Sandbox expired, recreation required')
      return { healthy: false, shouldRecreate: true, error: '410' }
    }

    await logger.error('Health check error')
    return { healthy: false, shouldRecreate: true, error: error.message }
  }
}
```

### Update Continuation Logic

**File**: `lib/tasks/continue-task.ts` (NEW - extract from endpoints)

```typescript
export async function continueTask(input: ContinueTaskInput) {
  const logger = createTaskLogger(input.taskId)
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId))

  let sandbox: Sandbox | null = null
  let shouldRecreate = false

  // Try to reconnect to existing sandbox
  if (task.keepAlive && task.sandboxId) {
    try {
      sandbox = await Sandbox.get({ sandboxId: task.sandboxId, ... })

      const health = await healthCheckSandbox(sandbox, logger)
      if (!health.healthy) {
        shouldRecreate = true
      }
    } catch {
      shouldRecreate = true
    }
  } else {
    shouldRecreate = true
  }

  // Recreate if needed
  if (shouldRecreate) {
    await logger.info('Creating new sandbox for continuation')

    // Clear session ID
    await db.update(tasks)
      .set({ agentSessionId: null })
      .where(eq(tasks.id, input.taskId))

    const sandboxResult = await createSandbox({ ... })
    sandbox = sandboxResult.sandbox
  }

  // Execute agent
  const isResumed = !shouldRecreate
  const sessionId = isResumed ? task.agentSessionId : undefined

  const result = await executeAgentInSandbox(
    sandbox,
    input.message,
    ...,
    isResumed,
    sessionId
  )

  // ... rest of continuation (Git push, etc.)
}
```

### Update Endpoints to Use Shared Logic

**Files**: `app/api/tasks/[taskId]/continue/route.ts`, `lib/mcp/tools/continue-task.ts`

```typescript
// Before: Duplicate logic in each endpoint
// After: Delegate to shared function
const result = await continueTask({
  taskId,
  message,
  userId: user.id,
  githubToken,
  githubUser,
  apiKeys,
})
```

### Testing
```bash
# Create task with keepAlive
curl -X POST ... -d '{"keepAlive":true,...}'

# Wait 1 hour for sandbox to expire (or manually delete in Vercel)

# Continue task
curl -X POST .../tasks/TASK_ID/continue -d '{"message":"Next step"}'

# Verify logs show:
# - "Sandbox expired, recreation required"
# - "Creating new sandbox"
# - NO "Failed to install Claude CLI" loops
```

---

## Fix 4: Activity-Based Timeout

### What to Change
Track timestamp of last output. Timeout if no output for 60s.

### Pattern for Agent Loops

**Files**: `lib/sandbox/agents/claude.ts`, `cursor.ts`

```typescript
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

    // Update last output time on ANY chunk
    lastOutputTime = Date.now()

    // ... existing JSON parsing ...

    callback()
  },
})

// Wait loop with inactivity detection
const startWaitTime = Date.now()
while (!isCompleted) {
  await new Promise(resolve => setTimeout(resolve, 2000))

  const now = Date.now()
  const totalElapsed = now - startWaitTime
  const inactivityElapsed = now - lastOutputTime

  // Check inactivity
  if (inactivityElapsed > INACTIVITY_TIMEOUT_MS) {
    await logger.error('Agent execution timed out due to inactivity')

    try {
      if (agentProcess?.kill) agentProcess.kill('SIGTERM')
    } catch {}

    return {
      success: false,
      error: `No output for ${INACTIVITY_TIMEOUT_MS / 1000}s`,
      cliName: 'claude',
      changesDetected: false,
    }
  }

  // Check absolute timeout
  if (totalElapsed > MAX_WAIT_TIME_MS) {
    await logger.error('Maximum execution time reached')
    break
  }

  // Cancellation check (Fix 2)
  // ...
}
```

### Environment Variables

**File**: `.env.local` (optional, has defaults)

```bash
AGENT_INACTIVITY_TIMEOUT_MS=60000   # 60 seconds
AGENT_MAX_WAIT_TIME_MS=300000       # 5 minutes
```

### Testing
```bash
# Create task with prompt that causes agent to stall
# (e.g., infinite loop, network request that hangs)
curl -X POST ... -d '{"prompt":"Run while true; do sleep 1; done",...}'

# Verify task fails within 60s with "No output for 60s" error
# Verify normal tasks still complete (false positive check)
```

---

## Fix 5: Authoritative Timeouts

### What to Change
Make timeout handler actively terminate sandbox and set flag to prevent Git push.

### Timeout Flag System

**File**: `lib/tasks/process-task.ts`

```typescript
// Global timeout tracking
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

export async function processTaskWithTimeout(input: TaskProcessingInput) {
  const TASK_TIMEOUT_MS = input.maxDuration * 60 * 1000

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(async () => {
      // Check if already completed
      const [task] = await db.select()
        .from(tasks)
        .where(eq(tasks.id, input.taskId))

      if (task?.status === 'completed' || task?.status === 'stopped') {
        return // Race condition: task finished
      }

      // Mark as timed out
      markTaskAsTimedOut(input.taskId)

      // Log timeout
      const logger = createTaskLogger(input.taskId)
      await logger.error('Task execution timed out')

      // Terminate sandbox
      if (task?.sandboxId) {
        await shutdownSandboxById(task.sandboxId, logger)
      }

      // Update status
      await db.update(tasks)
        .set({
          status: 'error',
          error: `Timeout after ${input.maxDuration} minutes`,
        })
        .where(eq(tasks.id, input.taskId))

      reject(new Error('Task timed out'))
    }, TASK_TIMEOUT_MS)
  })

  try {
    await Promise.race([processTask(input), timeoutPromise])
  } finally {
    clearTimeoutFlag(input.taskId)
  }
}

async function processTask(input: TaskProcessingInput) {
  // ... sandbox creation, agent execution ...

  if (agentResult.success) {
    // Check timeout before Git operations
    if (isTaskTimedOut(input.taskId)) {
      await logger.info('Skipping Git push due to timeout')
      return
    }

    // Generate commit message
    const commitMessage = await generateCommitMessage(...)

    // Check again (may have timed out during commit generation)
    if (isTaskTimedOut(input.taskId)) {
      await logger.info('Skipping Git push due to timeout')
      return
    }

    // Push changes
    await pushChangesToBranch(...)
  }
}
```

### Testing
```bash
# Create task with 1-minute timeout and slow operation
curl -X POST ... -d '{"maxDuration":1,"prompt":"Long task",...}'

# Verify:
# - Task times out after 60s
# - Sandbox is terminated (check Vercel)
# - No Git push occurred
# - Status is 'error'
```

---

## Code Quality Checklist

**Before Implementation**:
- [ ] Run `pnpm type-check` to verify current types
- [ ] Read all affected files with Read tool
- [ ] Understand current flow

**During Implementation**:
- [ ] Use static strings in all log statements
- [ ] Add TypeScript types for new interfaces
- [ ] Handle all error cases
- [ ] Add comments for complex logic

**After Implementation**:
- [ ] Run `pnpm format`
- [ ] Run `pnpm type-check` (must pass)
- [ ] Run `pnpm lint` (must pass)
- [ ] Manual testing with real task
- [ ] Git commit with descriptive message

---

## Common Pitfalls

### Fix 1
❌ **Don't**: Forget to handle 410 responses
✅ **Do**: Treat 410 as success (already terminated)

### Fix 2
❌ **Don't**: Poll too frequently (causes DB load)
✅ **Do**: Use 2-second intervals

❌ **Don't**: Forget to handle `cancelled` in process-task.ts
✅ **Do**: Skip Git push when `cancelled: true`

### Fix 3
❌ **Don't**: Throw error on health check failure
✅ **Do**: Return `shouldRecreate: true` and handle gracefully

❌ **Don't**: Reuse sessionId after recreation
✅ **Do**: Clear `agentSessionId` when recreating

### Fix 4
❌ **Don't**: Use dynamic values in timeout logs
✅ **Do**: Use static strings only

❌ **Don't**: Set inactivity timeout too low
✅ **Do**: Start with 60s, tune based on metrics

### Fix 5
❌ **Don't**: Forget to check timeout flag before Git push
✅ **Do**: Check before AND after commit message generation

❌ **Don't**: Let background task update status after timeout
✅ **Do**: Check task status in timeout handler before proceeding

---

## Debugging Commands

```bash
# Check if sandbox is running in Vercel
vercel sandboxes ls --token $VERCEL_TOKEN

# Get sandbox details
vercel sandboxes get SANDBOX_ID --token $VERCEL_TOKEN

# Check task status in database
psql $POSTGRES_URL -c "SELECT id, status, sandboxId, error FROM tasks WHERE id='TASK_ID';"

# Check task logs
psql $POSTGRES_URL -c "SELECT logs FROM tasks WHERE id='TASK_ID';" | jq

# Monitor active sandboxes in registry (during development)
# Add endpoint: GET /api/debug/active-sandboxes
# Returns: { count: number, taskIds: string[] }
```

---

## Quick Reference Tables

### Function Locations

| Function | File | Purpose |
|----------|------|---------|
| `shutdownSandboxById()` | `lib/sandbox/git.ts` | Terminate by sandboxId |
| `healthCheckSandbox()` | `lib/sandbox/health.ts` | Check sandbox health |
| `continueTask()` | `lib/tasks/continue-task.ts` | Shared continuation logic |
| `isTaskStopped()` | `lib/tasks/process-task.ts` | Check task status |
| `markTaskAsTimedOut()` | `lib/tasks/process-task.ts` | Set timeout flag |

### Modified Files by Fix

| Fix | Files Changed | Lines Added | Complexity |
|-----|---------------|-------------|------------|
| 1 | 3 | ~50 | Low |
| 2 | 5 | ~100 | Medium |
| 3 | 4 | ~150 | Medium |
| 4 | 2 | ~50 | Low |
| 5 | 1 | ~80 | High |

### Timeout Values

| Timeout | Default | Env Var | Purpose |
|---------|---------|---------|---------|
| Inactivity | 60s | `AGENT_INACTIVITY_TIMEOUT_MS` | No output → fail |
| Absolute | 5min | `AGENT_MAX_WAIT_TIME_MS` | Hard limit |
| Health check | 5s | (hardcoded) | Sandbox responsiveness |
| Task timeout | Variable | `maxDuration` field | User-specified limit |

---

**For full implementation details, see `SANDBOX_FIX_IMPLEMENTATION_PLAN.md`**
**For high-level overview, see `SANDBOX_FIX_SUMMARY.md`**
