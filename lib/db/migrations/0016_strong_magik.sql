ALTER TABLE "tasks" ADD COLUMN "keep_alive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sandbox_id" text;