/**
 * MCP Server Route Handler
 *
 * Provides Model Context Protocol (MCP) server functionality for the AA Coding Agent platform.
 * Exposes tools for creating, managing, and monitoring coding tasks via MCP clients.
 *
 * Features:
 * - Bearer token authentication via API tokens
 * - Query parameter auth support (?apikey=xxx -> Authorization header via middleware)
 * - 5 core tools: create-task, get-task, continue-task, list-tasks, stop-task
 * - Streamable HTTP transport (no SSE for simplicity)
 * - User-scoped access control
 *
 * Client Configuration Example:
 * {
 *   "mcpServers": {
 *     "aa-coding-agent": {
 *       "url": "https://your-domain.com/api/mcp?apikey=YOUR_API_KEY"
 *     }
 *   }
 * }
 */

import { createMcpHandler, experimental_withMcpAuth } from 'mcp-handler'
import { NextRequest } from 'next/server'
import { getAuthFromRequest } from '@/lib/auth/api-token'
import {
  createTaskHandler,
  getTaskHandler,
  continueTaskHandler,
  listTasksHandler,
  stopTaskHandler,
} from '@/lib/mcp/tools'
import {
  createTaskSchema,
  getTaskSchema,
  continueTaskSchema,
  listTasksSchema,
  stopTaskSchema,
  type CreateTaskInput,
  type GetTaskInput,
  type ContinueTaskInput,
  type ListTasksInput,
  type StopTaskInput,
} from '@/lib/mcp/schemas'
import type { McpToolContext } from '@/lib/mcp/types'

/**
 * Adapter to transform MCP library's extra parameter into our McpToolContext format.
 * The MCP library passes auth info via extra.authInfo, which we forward to our handlers.
 *
 * Note: We use type assertions here because the MCP library's types are more specific
 * than our generic McpToolResponse type, but the runtime behavior is compatible.
 */
function adaptContext(extra: unknown): McpToolContext {
  return extra as McpToolContext
}

/**
 * Adapter to ensure return type compatibility with MCP library.
 * Casts our McpToolResponse to the expected type.
 */
function adaptResponse(response: Promise<unknown>): any {
  return response
}

// Create base MCP handler with all tool registrations
const baseHandler = createMcpHandler(
  async (server) => {
    // Tool 1: Create Task
    server.registerTool(
      'create-task',
      {
        title: 'Create Coding Task',
        description:
          'Create a new coding task with an AI agent. Returns a task ID that can be used to check status and continue the conversation.',
        inputSchema: createTaskSchema,
      },
      async (input: CreateTaskInput, extra) => {
        return adaptResponse(createTaskHandler(input, adaptContext(extra)))
      },
    )

    // Tool 2: Get Task
    server.registerTool(
      'get-task',
      {
        title: 'Get Task Details',
        description: 'Retrieve detailed information about a task including status, logs, progress, and PR information.',
        inputSchema: getTaskSchema,
      },
      async (input: GetTaskInput, extra) => {
        return adaptResponse(getTaskHandler(input, adaptContext(extra)))
      },
    )

    // Tool 3: Continue Task
    server.registerTool(
      'continue-task',
      {
        title: 'Continue Task',
        description:
          'Send a follow-up message to continue a task with additional instructions. The task must have completed its initial execution.',
        inputSchema: continueTaskSchema,
      },
      async (input: ContinueTaskInput, extra) => {
        return adaptResponse(continueTaskHandler(input, adaptContext(extra)))
      },
    )

    // Tool 4: List Tasks
    server.registerTool(
      'list-tasks',
      {
        title: 'List Tasks',
        description:
          'List all tasks for the authenticated user with optional filters by status. Returns up to 100 results.',
        inputSchema: listTasksSchema,
      },
      async (input: ListTasksInput, extra) => {
        return adaptResponse(listTasksHandler(input, adaptContext(extra)))
      },
    )

    // Tool 5: Stop Task
    server.registerTool(
      'stop-task',
      {
        title: 'Stop Task',
        description:
          'Stop a running task and terminate its sandbox. Only works for tasks that are currently processing.',
        inputSchema: stopTaskSchema,
      },
      async (input: StopTaskInput, extra) => {
        return adaptResponse(stopTaskHandler(input, adaptContext(extra)))
      },
    )
  },
  {}, // Capabilities object (empty for now)
  {
    basePath: '/api',
    maxDuration: 60, // 1 minute timeout
    verboseLogs: process.env.NODE_ENV === 'development',
    disableSse: true, // Use Streamable HTTP only (simpler, no Redis needed)
  },
)

// Wrap handler with authentication middleware
const handler = experimental_withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    // The middleware has already transformed ?apikey=xxx to Authorization: Bearer xxx
    // So we can use the existing getAuthFromRequest helper

    if (!bearerToken) {
      // No token provided - deny access
      return undefined
    }

    // Validate token and get user using existing auth helper
    // Cast to NextRequest since getAuthFromRequest expects it
    const user = await getAuthFromRequest(request as NextRequest)

    if (!user) {
      // Invalid token or user not found
      return undefined
    }

    // Return auth info in the format expected by MCP tools
    return {
      token: bearerToken,
      clientId: user.id, // Tools access this via context.extra.authInfo.clientId
      scopes: [], // No scope-based auth for now
      extra: { user }, // Full user object available in context.extra.authInfo.extra.user
    }
  },
  {
    required: true, // Enforce authentication for all tools
  },
)

// Export HTTP methods
export { handler as GET, handler as POST, handler as DELETE }
