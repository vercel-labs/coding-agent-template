ALTER TABLE "tasks" ADD COLUMN "sandbox_type" text DEFAULT 'vercel' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sandbox_provider" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "snapshot_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "interactive_mode" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ssh_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "terminal_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "vscode_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "inngest_run_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "inngest_event_id" text;