ALTER TABLE "tasks" ALTER COLUMN "max_duration" SET DEFAULT 300;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_logs" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "server_logs" jsonb;