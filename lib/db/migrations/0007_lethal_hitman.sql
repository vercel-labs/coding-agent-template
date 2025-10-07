ALTER TABLE "connectors" ALTER COLUMN "base_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connectors" ADD COLUMN "type" text DEFAULT 'remote' NOT NULL;--> statement-breakpoint
ALTER TABLE "connectors" ADD COLUMN "command" text;--> statement-breakpoint
ALTER TABLE "connectors" ADD COLUMN "args" jsonb;--> statement-breakpoint
ALTER TABLE "connectors" ADD COLUMN "env" jsonb;