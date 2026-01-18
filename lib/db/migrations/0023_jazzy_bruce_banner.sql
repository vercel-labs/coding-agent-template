ALTER TABLE "tasks" ADD COLUMN "sub_agent_activity" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "current_sub_agent" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "last_heartbeat" timestamp;