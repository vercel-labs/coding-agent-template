-- Add indexes for rate limiting queries to prevent table scans
-- Index 1: tasks(user_id, created_at) for efficient task counting by user and date
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_created_at ON "tasks"("user_id", "created_at");

-- Index 2: tasks(user_id, deleted_at) for soft delete filtering in rate limit checks
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_deleted_at ON "tasks"("user_id", "deleted_at");

-- Index 3: task_messages(task_id) for join performance with tasks table
CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON "task_messages"("task_id");

-- Index 4: task_messages(created_at) for efficient date range filtering
CREATE INDEX IF NOT EXISTS idx_task_messages_created_at ON "task_messages"("created_at");
