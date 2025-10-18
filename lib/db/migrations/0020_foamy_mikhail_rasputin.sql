ALTER TABLE "tasks" ALTER COLUMN "max_duration" SET DEFAULT 300;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "auto_create_pr" boolean DEFAULT false;