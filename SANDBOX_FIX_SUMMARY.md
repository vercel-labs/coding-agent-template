# Sandbox Fix Implementation - Executive Summary

## Problem Statement
Agents get stuck and don't respond to stop requests. Sandboxes continue running in background even after UI shows "stopped" or "error".

## Root Causes (5)
1. **In-memory stop registry** - Stop requests only work within same Lambda invocation
2. **No cancellation checks** - Agent loops ignore task.status changes
3. **No health probe** - Expired sandboxes cause CLI reinstall loops instead of recreation
4. **Fixed timeout** - No inactivity detection (agents can stall for 5 minutes)
5. **Non-authoritative timeout** - Timeout doesn't stop sandbox, allows background execution

## Solutions Overview

| Fix | Files | Complexity | Risk | Impact |
|-----|-------|------------|------|--------|
| 1. DB-backed stop | 3 files | Low | Low | Stop works cross-Lambda |
| 2. Cancellation checks | 5 files | Medium | Medium | Stop halts execution in 2-4s |
| 3. Health probe | 4 files | Medium | Low | 410 errors → recreate, not reinstall |
| 4. Inactivity timeout | 2 files | Low | Medium | Stuck agents fail in 60s |
| 5. Authoritative timeout | 1 file | High | High | Timeout guarantees termination |

## Implementation Timeline

### Week 1: Foundation
- **Fix 1 (DB-backed stop)**: Create `shutdownSandboxById()`, update stop endpoints
- Test: Stop task from different serverless invocation

### Week 2: Execution Control
- **Fix 2 (Cancellation)**: Add polling to agent loops, handle `cancelled` result
- **Fix 5 (Timeout)**: Add timeout flag, terminate sandbox in timeout handler
- Test: Stop mid-execution, verify no Git push

### Week 3: Reliability
- **Fix 3 (Health probe)**: Add health check before resume, handle 410 → recreate
- **Fix 4 (Inactivity)**: Track last output, timeout on 60s silence
- Test: Resume expired sandbox, verify recreation

### Week 4: Integration
- End-to-end testing
- Monitoring setup
- Documentation
- Production rollout

## Key Changes

### Stop Handler (Fix 1)
```typescript
// Before: Only works in same Lambda
await killSandbox(taskId)

// After: Works across invocations
if (task.sandboxId) {
  await shutdownSandboxById(task.sandboxId, logger)
}
```

### Agent Loop (Fix 2 + 4)
```typescript
// Before: No cancellation, fixed timeout
while (!isCompleted) {
  await sleep(1000)
  if (elapsed > 5min) break
}

// After: Cancellation + inactivity detection
while (!isCompleted) {
  await sleep(2000)

  // Check cancellation
  if (task.status === 'stopped') {
    return { cancelled: true }
  }

  // Check inactivity
  if (now - lastOutputTime > 60s) {
    return { error: 'Inactivity timeout' }
  }

  // Check absolute timeout
  if (elapsed > 5min) break
}
```

### Sandbox Resume (Fix 3)
```typescript
// Before: Assume sandbox is healthy
const sandbox = await Sandbox.get({ sandboxId })
await executeAgent(sandbox)

// After: Health check before reuse
const sandbox = await Sandbox.get({ sandboxId })
const health = await healthCheckSandbox(sandbox)
if (!health.healthy) {
  // Recreate sandbox, clear sessionId
  sandbox = await createSandbox()
}
await executeAgent(sandbox)
```

### Task Timeout (Fix 5)
```typescript
// Before: Promise.race, no cleanup
await Promise.race([processTask(), timeout()])

// After: Active termination
setTimeout(async () => {
  markTaskAsTimedOut(taskId)
  await shutdownSandboxById(sandboxId)
  await updateTaskStatus('error')
}, TIMEOUT)

await processTask() // Checks timeout flag before Git push
```

## Testing Checklist

**Per-Fix Testing**:
- ✓ Unit tests with mocked dependencies
- ✓ Integration tests for new code paths
- ✓ Manual testing with real tasks

**End-to-End Scenarios**:
1. Create task → complete normally → verify Git push
2. Create task → stop during execution → verify no Git push
3. Create task → timeout → verify termination + no Git push
4. Create task with keepAlive → continue → verify session resume
5. Create task with keepAlive → wait 1h → continue → verify recreation
6. Create task with stalling prompt → verify inactivity timeout

**Production Validation**:
- Monitor sandbox termination success rate (target: >95%)
- Monitor cancellation response time (target: <5s)
- Monitor health check failure rate (baseline)
- Monitor inactivity timeout rate (target: <5%)
- Check for orphaned sandboxes in Vercel dashboard

## Risk Mitigation

**Staged Rollout**:
1. Week 1-2: Deploy fixes 1, 2 to 10% of users (canary)
2. Week 2: Monitor metrics, adjust if needed
3. Week 3: Deploy fixes 3, 4 to canary group
4. Week 4: Full production rollout of all 5 fixes

**Feature Flags** (recommended):
```bash
ENABLE_DB_BACKED_STOP=true
ENABLE_CANCELLATION_CHECKS=true
ENABLE_HEALTH_PROBE=true
ENABLE_INACTIVITY_TIMEOUT=true
ENABLE_AUTHORITATIVE_TIMEOUT=true
```

**Rollback Plan**:
- Each fix is independent → can rollback individually
- Feature flags allow instant disable without redeployment
- Fallback to old behavior if flag is false

## Success Metrics

**Fix 1 (DB-backed stop)**:
- Stop success rate: >95%
- Cross-Lambda stop works: 100%
- Sandbox termination time: <30s

**Fix 2 (Cancellation)**:
- Cancellation response time: <5s
- No Git push after stop: 100%
- False positive rate: <1%

**Fix 3 (Health probe)**:
- 410 → recreate success rate: >95%
- Session resume success rate: >90%
- No CLI reinstall loops: 100%

**Fix 4 (Inactivity)**:
- Inactivity timeout rate: <5%
- False positive rate: <2%
- Stuck agent detection time: <60s

**Fix 5 (Timeout)**:
- Timeout termination success: >95%
- No Git push after timeout: 100%
- Race condition incidents: 0

## Dependencies

```
Fix 1 (DB-backed stop)
  ↓
Fix 2 (Cancellation) ──→ Fix 5 (Timeout)
  ↓
Fix 3 (Health probe)
  ↓
Fix 4 (Inactivity)
```

**Implementation Order**:
1. Fix 1 (no dependencies)
2. Fix 2 (depends on Fix 1)
3. Fix 5 (depends on Fix 1, 2)
4. Fix 3 (depends on Fix 1)
5. Fix 4 (depends on Fix 2)

## Key Files Modified

**Core Logic** (7 files):
- `lib/sandbox/git.ts` - Add `shutdownSandboxById()`
- `lib/sandbox/health.ts` - NEW - Health check
- `lib/sandbox/agents/claude.ts` - Cancellation + inactivity
- `lib/sandbox/agents/cursor.ts` - Cancellation + inactivity
- `lib/sandbox/types.ts` - Add `cancelled` field
- `lib/tasks/process-task.ts` - Timeout flags
- `lib/tasks/continue-task.ts` - NEW - Shared continuation

**API Endpoints** (4 files):
- `app/api/tasks/[taskId]/route.ts` - DB-backed stop
- `lib/mcp/tools/stop-task.ts` - DB-backed stop
- `app/api/tasks/[taskId]/continue/route.ts` - Use shared logic
- `lib/mcp/tools/continue-task.ts` - Use shared logic

**Total**: 11 files (7 new, 4 modified)

## Configuration

**New Environment Variables**:
```bash
# Optional: Configure timeout values
AGENT_INACTIVITY_TIMEOUT_MS=60000  # 60 seconds
AGENT_MAX_WAIT_TIME_MS=300000      # 5 minutes

# Optional: Feature flags for gradual rollout
ENABLE_DB_BACKED_STOP=true
ENABLE_CANCELLATION_CHECKS=true
ENABLE_HEALTH_PROBE=true
ENABLE_INACTIVITY_TIMEOUT=true
ENABLE_AUTHORITATIVE_TIMEOUT=true
```

## Monitoring Setup

**Metrics to Track**:
1. Sandbox termination success rate
2. Cancellation response time
3. Health check failure rate
4. Inactivity timeout rate
5. Timeout cleanup success rate

**Alerts**:
1. Stop failure rate >10% → investigate
2. Inactivity timeout rate >20% → agent issues
3. Orphaned sandboxes detected → cleanup needed

**Dashboards**:
- Task lifecycle timeline (creation → execution → completion)
- Sandbox lifecycle timeline (create → health check → resume/recreate → terminate)
- Stop request handling (request → DB lookup → termination → confirmation)

## Questions & Decisions

**Before Implementation**:
1. Approve timeout values (60s inactivity, 5min absolute)?
2. Approve polling frequency (2s for cancellation checks)?
3. Implement feature flags or direct deploy?
4. Which metrics platform to use?
5. Canary percentage (10% or 50%)?

**During Implementation**:
1. Monitor logs for unexpected errors
2. Adjust timeout values based on real usage
3. Fine-tune health check sensitivity
4. Add more detailed logging if needed

**After Implementation**:
1. Review metrics weekly for first month
2. Adjust configuration based on data
3. Document lessons learned
4. Plan future improvements (e.g., process kill improvements)

## Next Actions

**Immediate** (this week):
1. Review plan with team
2. Set up monitoring infrastructure
3. Create feature flag system
4. Begin Fix 1 implementation

**Short-term** (weeks 1-4):
1. Implement fixes in order
2. Test each fix thoroughly
3. Deploy to canary group
4. Monitor metrics

**Long-term** (month 2+):
1. Full production rollout
2. Gather user feedback
3. Optimize timeout values
4. Plan v2 improvements

---

**For detailed implementation details, see `SANDBOX_FIX_IMPLEMENTATION_PLAN.md`**
