# Sandbox and Agent "Stuck" Behavior Report

## Executive Summary
The observed "stuck" behavior is primarily caused by three gaps: stop requests do not reliably terminate sandboxes, cancellation is not propagated into long-running agent loops, and agent execution runs detached while completion detection depends on streamed output that may never emit a terminal "result" event. These issues compound during follow-up execution when a previously created sandbox has expired or become unreachable, leading to 410 responses and failed CLI installs instead of sandbox recreation.

## Background and Observed Behavior
The example task shows the agent starting normally, installing dependencies, installing the Claude CLI, then entering a long wait loop ("Waiting for agent completion"). A stop request is later issued, but the sandbox is not reliably terminated. A follow-up attempt reconnects to the same sandbox, receives HTTP 410 errors, tries to reinstall the CLI, and fails.

## Evidence From Code Paths
The behavior in the logs aligns with current execution flow:
- The agent process is launched in detached mode and completion depends on streamed JSON output that must contain a "result" event. If no result arrives, the loop logs "Waiting for agent completion" until a fixed timeout elapses, but the underlying process is not forcibly terminated.
- Stop requests only attempt to kill the sandbox using an in-memory registry, which is scoped to a single serverless invocation and often cannot locate the correct sandbox across requests.
- Continuation attempts use Sandbox.get to reconnect, but there is no explicit health check. If the sandbox is expired, command execution can return a 410 and the code treats it as a missing CLI, triggering a reinstall instead of recreating the sandbox.
- The global task timeout uses Promise.race without cancellation, so the original process can continue running even after the task is marked as errored.

## Root Causes
1. Stop request cannot reliably kill a sandbox
   - The kill path depends on an in-memory map, so a different serverless instance cannot find the sandbox to stop it.
   - Result: The sandbox can remain running even after a stop request, and the agent continues to execute.

2. Cancellation is not checked inside agent execution loops
   - Only a pre-flight cancellation check exists. Once the agent starts, a stop request does not interrupt the agent loop.
   - Result: UI shows "stopped" but backend continues running work.

3. Detached agent execution with fragile completion detection
   - The agent is started in detached mode and completion depends on a streamed "result" event. If streaming stalls or the CLI never emits a result, the system keeps waiting and only breaks after a fixed wait time.
   - Result: The "stuck" wait loop appears and the process may still be running after the wait loop ends.

4. Sandbox resume does not validate health before reuse
   - A follow-up attempt reuses an existing sandbox without a quick health probe.
   - If the sandbox has expired, command execution returns a 410 error and the code tries to reinstall the CLI instead of recreating the sandbox.

5. Timeout does not cancel underlying work
   - The task timeout uses Promise.race and logs a timeout error, but the original task continues in the background.
   - Result: Long-running processes can outlive the task status and block subsequent attempts.

## Mitigation Plan (Short-Term)
1. Replace in-memory stop logic with DB-backed termination
   - Fetch tasks.sandboxId and use Sandbox.get + stop/shutdown.
   - Fall back to a best-effort process kill if the sandbox is unreachable.

2. Add cancellation checks inside agent loops
   - Poll isTaskStopped in the Claude/Cursor wait loops.
   - If stopped, terminate the CLI process and return a cancellation result.

3. Add sandbox health probe before resuming
   - Run a lightweight command (e.g., "true") and treat 410 as a signal to recreate the sandbox.
   - If the sandbox is recreated, clear agentSessionId and relaunch without resume flags.

4. Tie agent wait loop to output activity rather than fixed wait
   - Track last output timestamp and treat prolonged inactivity as a failure.
   - On inactivity timeout, terminate the process and mark the task as errored.

## Remediation Plan (Medium-Term)
1. Centralize cancellation and cleanup
   - Create a shared cancellation primitive used by processTask, continueTask, and agent implementations.
   - Ensure that a stop request triggers both process termination and sandbox shutdown.

2. Improve CLI execution lifecycle management
   - Avoid detached mode where possible, or capture process IDs to force termination.
   - Standardize a single "agent done" signal and ensure it is logged, even on error.

3. Make timeouts authoritative
   - When a task times out, stop the sandbox and mark the task as final, preventing background execution.

## Proposed Implementation Steps
1. Update stop handler to use tasks.sandboxId with Sandbox.get and shutdown.
2. Extend executeAgentInSandbox to accept an onCancellationCheck and pass it from processTask and continueTask.
3. Add a health check before resuming and recreate sandbox on 410.
4. Track last output timestamp in streaming parsers and exit on inactivity.
5. Ensure timeout code actively shuts down the sandbox and ends agent execution.

## Verification Plan
- Start a task and issue stop during agent execution; confirm the sandbox stops and no further logs appear.
- Run a task with keepAlive, wait for sandbox expiration, then continue; confirm the system recreates a sandbox instead of reinstalling the CLI.
- Trigger a long-running agent prompt; confirm inactivity timeout ends the task and shuts down the sandbox.
- Confirm follow-up tasks still work when resume data is valid and the sandbox is healthy.

## Risk and Impact
- Low risk to user-facing behavior if stop and timeout logic becomes stricter; the main impact is shorter execution windows on inactivity.
- Medium operational impact if aggressive termination causes partial work loss; mitigated by clear logging and retry capability.

