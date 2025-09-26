ALTER TABLE "tasks" ADD COLUMN "install_dependencies" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "max_duration" integer DEFAULT 5;