import { pgTable, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core'
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
  installDependencies: boolean('install_dependencies').default(false),
  maxDuration: integer('max_duration').default(5),
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'error', 'stopped'],
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
  selectedAgent: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).default('claude'),
  selectedModel: z.string().optional(),
  installDependencies: z.boolean().default(false),
  maxDuration: z.number().default(5),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']).default('pending'),
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
  installDependencies: z.boolean().nullable(),
  maxDuration: z.number().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']),
  progress: z.number().nullable(),
  logs: z.array(logEntrySchema).nullable(),
  error: z.string().nullable(),
  branchName: z.string().nullable(),
  sandboxUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
})

export type Task = z.infer<typeof selectTaskSchema>
export type InsertTask = z.infer<typeof insertTaskSchema>

export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type', {
    enum: ['local', 'remote'],
  })
    .notNull()
    .default('remote'),
  // For remote MCP servers
  baseUrl: text('base_url'),
  oauthClientId: text('oauth_client_id'),
  oauthClientSecret: text('oauth_client_secret'),
  // For local MCP servers
  command: text('command'),
  args: jsonb('args').$type<string[]>(),
  // Environment variables (for both local and remote)
  env: jsonb('env').$type<Record<string, string>>(),
  status: text('status', {
    enum: ['connected', 'disconnected'],
  })
    .notNull()
    .default('disconnected'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const insertConnectorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['local', 'remote']).default('remote'),
  // For remote MCP servers
  baseUrl: z.string().url('Must be a valid URL').optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  // For local MCP servers
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  // Environment variables (for both local and remote)
  env: z.record(z.string()).optional(),
  status: z.enum(['connected', 'disconnected']).default('disconnected'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectConnectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['local', 'remote']),
  // For remote MCP servers
  baseUrl: z.string().nullable(),
  oauthClientId: z.string().nullable(),
  oauthClientSecret: z.string().nullable(),
  // For local MCP servers
  command: z.string().nullable(),
  args: z.array(z.string()).nullable(),
  // Environment variables (for both local and remote)
  env: z.record(z.string()).nullable(),
  status: z.enum(['connected', 'disconnected']),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Connector = z.infer<typeof selectConnectorSchema>
export type InsertConnector = z.infer<typeof insertConnectorSchema>
