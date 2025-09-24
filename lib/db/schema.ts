import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'
import { z } from 'zod'

// Log entry types
export const logEntrySchema = z.object({
  type: z.enum(['info', 'command', 'error', 'success']),
  message: z.string(),
  timestamp: z.date().optional(),
})

export type LogEntry = z.infer<typeof logEntrySchema>

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  prompt: text('prompt').notNull(),
  repoUrl: text('repo_url'),
  selectedAgent: text('selected_agent').default('claude'),
  selectedModel: text('selected_model'),
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'error'],
  })
    .notNull()
    .default('pending'),
  progress: integer('progress').default(0),
  logs: jsonb('logs').$type<LogEntry[]>(),
  error: text('error'),
  branchName: text('branch_name'),
  sandboxUrl: text('sandbox_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})

// Manual Zod schemas for validation
export const insertTaskSchema = z.object({
  id: z.string().optional(),
  prompt: z.string().min(1, 'Prompt is required'),
  repoUrl: z.string().url('Must be a valid URL').optional(),
  selectedAgent: z.enum(['claude', 'codex', 'cursor', 'opencode']).default('claude'),
  selectedModel: z.string().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'error']).default('pending'),
  progress: z.number().min(0).max(100).default(0),
  logs: z.array(logEntrySchema).optional(),
  error: z.string().optional(),
  branchName: z.string().optional(),
  sandboxUrl: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  completedAt: z.date().optional(),
})

export const selectTaskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  repoUrl: z.string().nullable(),
  selectedAgent: z.string().nullable(),
  selectedModel: z.string().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'error']),
  progress: z.number().nullable(),
  logs: z.array(logEntrySchema).nullable(),
  error: z.string().nullable(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  branchName: z.string().nullable(),
  sandboxUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
})

export type Task = z.infer<typeof selectTaskSchema>
export type InsertTask = z.infer<typeof insertTaskSchema>
