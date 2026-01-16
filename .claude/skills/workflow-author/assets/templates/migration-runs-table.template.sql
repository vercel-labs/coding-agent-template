-- Create {{workflow_snake}}_runs table for storing {{workflow_slug}} workflow state
CREATE TABLE IF NOT EXISTS "{{workflow_snake}}_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" text,
  "model_id" varchar(100),
  "state" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE OR REPLACE FUNCTION "{{workflow_snake}}_runs_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "{{workflow_snake}}_runs_set_updated_at_trigger"
  BEFORE UPDATE ON "{{workflow_snake}}_runs"
  FOR EACH ROW
  EXECUTE FUNCTION "{{workflow_snake}}_runs_set_updated_at"();

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "{{workflow_snake}}_runs_user_id_idx" ON "{{workflow_snake}}_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "{{workflow_snake}}_runs_created_at_idx" ON "{{workflow_snake}}_runs" ("created_at" DESC);

-- Enable RLS
ALTER TABLE "{{workflow_snake}}_runs" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own runs
CREATE POLICY "{{workflow_snake}}_runs_user_policy" ON "{{workflow_snake}}_runs"
  FOR ALL
  USING (auth.uid() = "user_id")
  WITH CHECK (auth.uid() = "user_id");
