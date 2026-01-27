-- Add heartbeat extension count for sandbox timeout guardrails
-- This tracks how many times a task's timeout has been extended via heartbeat
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "heartbeat_extension_count" integer DEFAULT 0;

-- Add index for efficient querying of tasks with extensions
CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat_extension ON "tasks"("heartbeat_extension_count") WHERE "heartbeat_extension_count" > 0;

-- Add index for efficient sandbox cleanup queries (find stale sandboxes)
CREATE INDEX IF NOT EXISTS idx_tasks_sandbox_cleanup ON "tasks"("sandbox_id", "last_heartbeat") WHERE "sandbox_id" IS NOT NULL;
