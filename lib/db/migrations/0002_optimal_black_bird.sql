-- Add new jsonb logs column
ALTER TABLE "tasks" ADD COLUMN "logs_new" jsonb;

-- Convert existing text array logs to structured jsonb logs
UPDATE "tasks" 
SET "logs_new" = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'info',
      'message', log_entry,
      'timestamp', now()
    )
  )
  FROM unnest("logs"::text[]) AS log_entry
)
WHERE "logs" IS NOT NULL;

-- Drop old logs column and rename new one
ALTER TABLE "tasks" DROP COLUMN "logs";
ALTER TABLE "tasks" RENAME COLUMN "logs_new" TO "logs";