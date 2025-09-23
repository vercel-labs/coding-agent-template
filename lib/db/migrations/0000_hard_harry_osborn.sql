CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"title" text,
	"repo_url" text,
	"selected_agent" text DEFAULT 'claude',
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0,
	"logs" text[],
	"error" text,
	"description" text,
	"instructions" text,
	"branch_name" text,
	"sandbox_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
