/**
 * MCP Tool Handlers
 *
 * Export all MCP tool handlers for the coding agent platform.
 * These handlers delegate to existing API/database logic while
 * following the MCP protocol conventions.
 */

export { createTaskHandler } from './create-task'
export { getTaskHandler } from './get-task'
export { continueTaskHandler } from './continue-task'
export { listTasksHandler } from './list-tasks'
export { stopTaskHandler } from './stop-task'
