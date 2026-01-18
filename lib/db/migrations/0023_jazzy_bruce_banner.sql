ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sub_agent_activity" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "current_sub_agent" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "last_heartbeat" timestamp;