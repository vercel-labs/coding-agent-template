/**
 * MCP Tool Handler Types
 *
 * Type definitions for MCP tool handlers that integrate with the coding agent platform.
 */

/**
 * Authentication information passed to tool handlers via context
 */
export interface McpAuthInfo {
  token?: string
  clientId?: string // This maps to userId in our system
  scopes?: string[]
  extra?: Record<string, unknown>
}

/**
 * Context object passed to tool handlers
 */
export interface McpToolContext {
  extra?: {
    authInfo?: McpAuthInfo
    [key: string]: unknown
  }
}

/**
 * Content item returned by tool handlers
 */
export interface McpToolContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
}

/**
 * Response returned by tool handlers
 */
export interface McpToolResponse {
  content: McpToolContent[]
  isError?: boolean
}

/**
 * Generic MCP tool handler function type
 *
 * @template TInput - The input type (should match the Zod schema)
 * @param input - Validated input from the client
 * @param context - Optional context with authentication info
 * @returns Promise resolving to tool response
 */
export type McpToolHandler<TInput = unknown> = (input: TInput, context?: McpToolContext) => Promise<McpToolResponse>
