import { z } from 'zod'

/**
 * Schema for creating a new coding task
 */
export const createTaskSchema = z.object({
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(5000, 'Prompt must be 5000 characters or less')
    .describe('The task prompt describing what the AI agent should do'),
  repoUrl: z.string().url('Must be a valid repository URL').describe('GitHub repository URL to work on'),
  sourceBranch: z.string().optional().describe('Specific branch to clone from (defaults to repository default branch)'),
  selectedAgent: z
    .enum(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode'])
    .default('claude')
    .describe('AI agent to use for executing the task'),
  selectedModel: z
    .string()
    .optional()
    .describe('Specific model to use (e.g., claude-sonnet-4-5-20250929, gpt-5.2-codex)'),
  installDependencies: z
    .boolean()
    .default(false)
    .describe('Whether to automatically install dependencies before running the agent'),
  keepAlive: z
    .boolean()
    .default(false)
    .describe('Whether to keep the sandbox alive after task completion for debugging'),
})

/**
 * Schema for retrieving a task by ID
 */
export const getTaskSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required').describe('Unique identifier of the task to retrieve'),
})

/**
 * Schema for continuing a task with a follow-up message
 */
export const continueTaskSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required').describe('Unique identifier of the task to continue'),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be 5000 characters or less')
    .describe('Follow-up message or instruction to send to the AI agent'),
})

/**
 * Schema for listing tasks with optional filters
 */
export const listTasksSchema = z.object({
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be 100 or less')
    .default(20)
    .describe('Maximum number of tasks to return'),
  status: z
    .enum(['pending', 'processing', 'completed', 'error', 'stopped'])
    .optional()
    .describe('Filter tasks by status'),
})

/**
 * Schema for stopping a running task
 */
export const stopTaskSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required').describe('Unique identifier of the task to stop'),
})

/**
 * Type exports for TypeScript type safety
 */
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type GetTaskInput = z.infer<typeof getTaskSchema>
export type ContinueTaskInput = z.infer<typeof continueTaskSchema>
export type ListTasksInput = z.infer<typeof listTasksSchema>
export type StopTaskInput = z.infer<typeof stopTaskSchema>
