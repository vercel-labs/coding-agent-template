import { LogEntry, SubAgentActivity } from '@/lib/db/schema'

export type { LogEntry, SubAgentActivity }

// Agent source context for log entries
export interface AgentSource {
  name: string // Primary agent or sub-agent name
  isSubAgent?: boolean
  parentAgent?: string // Parent agent name if this is a sub-agent
  subAgentId?: string // ID linking to SubAgentActivity
}

// Redact sensitive information from log messages
export function redactSensitiveInfo(message: string): string {
  let redacted = message

  // Redact API keys - common patterns
  const apiKeyPatterns = [
    // Anthropic API keys (sk-ant-...)
    /ANTHROPIC_API_KEY[=\s]*["']?(sk-ant-[a-zA-Z0-9_-]{20,})/gi,
    // OpenAI API keys (sk-...)
    /OPENAI_API_KEY[=\s]*["']?([sk-][a-zA-Z0-9_-]{20,})/gi,
    // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
    /GITHUB_TOKEN[=\s]*["']?([gh][phosr]_[a-zA-Z0-9_]{20,})/gi,
    // GitHub tokens in URLs (https://token:x-oauth-basic@github.com or https://token@github.com)
    /https:\/\/(gh[phosr]_[a-zA-Z0-9_]{20,})(?::x-oauth-basic)?@github\.com/gi,
    // Generic API key patterns
    /API_KEY[=\s]*["']?([a-zA-Z0-9_-]{20,})/gi,
    // Bearer tokens
    /Bearer\s+([a-zA-Z0-9_-]{20,})/gi,
    // Generic tokens
    /TOKEN[=\s]*["']?([a-zA-Z0-9_-]{20,})/gi,
    // Vercel Team IDs (team_xxxx or alphanumeric strings after SANDBOX_VERCEL_TEAM_ID)
    /SANDBOX_VERCEL_TEAM_ID[=\s:]*["']?([a-zA-Z0-9_-]{8,})/gi,
    // Vercel Project IDs (prj_xxxx or alphanumeric strings after SANDBOX_VERCEL_PROJECT_ID)
    /SANDBOX_VERCEL_PROJECT_ID[=\s:]*["']?([a-zA-Z0-9_-]{8,})/gi,
    // Vercel tokens (any alphanumeric strings after SANDBOX_VERCEL_TOKEN)
    /SANDBOX_VERCEL_TOKEN[=\s:]*["']?([a-zA-Z0-9_-]{20,})/gi,
  ]

  // Apply redaction patterns
  apiKeyPatterns.forEach((pattern) => {
    redacted = redacted.replace(pattern, (match, key) => {
      // Special handling for GitHub URL pattern
      if (match.includes('github.com')) {
        const redactedKey =
          key.length > 8
            ? `${key.substring(0, 4)}${'*'.repeat(Math.max(8, key.length - 8))}${key.substring(key.length - 4)}`
            : '*'.repeat(key.length)
        // Replace the token in the URL while preserving the structure
        return match.replace(key, redactedKey)
      }

      // Keep the prefix and show first 4 and last 4 characters
      const prefix = match.substring(0, match.indexOf(key))
      const redactedKey =
        key.length > 8
          ? `${key.substring(0, 4)}${'*'.repeat(Math.max(8, key.length - 8))}${key.substring(key.length - 4)}`
          : '*'.repeat(key.length)
      return `${prefix}${redactedKey}`
    })
  })

  // Redact JSON field patterns (for teamId, projectId in JSON objects)
  redacted = redacted.replace(/"(teamId|projectId)"[\s:]*"([^"]+)"/gi, (match, fieldName) => {
    return `"${fieldName}": "[REDACTED]"`
  })

  // Redact environment variable assignments with sensitive values
  redacted = redacted.replace(
    /([A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|TEAM_ID|PROJECT_ID)[A-Z_]*)[=\s:]*["']?([a-zA-Z0-9_-]{8,})["']?/gi,
    (match, varName, value) => {
      const redactedValue =
        value.length > 8
          ? `${value.substring(0, 4)}${'*'.repeat(Math.max(8, value.length - 8))}${value.substring(value.length - 4)}`
          : '*'.repeat(value.length)
      return `${varName}="${redactedValue}"`
    },
  )

  return redacted
}

export function createLogEntry(
  type: LogEntry['type'],
  message: string,
  timestamp?: Date | string,
  agentSource?: AgentSource,
): LogEntry {
  // Convert Date to ISO string for JSONB storage
  const timestampValue = timestamp instanceof Date ? timestamp.toISOString() : timestamp || new Date().toISOString()
  return {
    type,
    message: redactSensitiveInfo(message),
    timestamp: timestampValue,
    agentSource: agentSource
      ? {
          name: agentSource.name,
          isSubAgent: agentSource.isSubAgent ?? false,
          parentAgent: agentSource.parentAgent,
          subAgentId: agentSource.subAgentId,
        }
      : undefined,
  }
}

export function createInfoLog(message: string, agentSource?: AgentSource): LogEntry {
  return createLogEntry('info', message, undefined, agentSource)
}

export function createCommandLog(command: string, args?: string[], agentSource?: AgentSource): LogEntry {
  const fullCommand = args ? `${command} ${args.join(' ')}` : command
  return createLogEntry('command', `$ ${fullCommand}`, undefined, agentSource)
}

export function createErrorLog(message: string, agentSource?: AgentSource): LogEntry {
  return createLogEntry('error', message, undefined, agentSource)
}

export function createSuccessLog(message: string, agentSource?: AgentSource): LogEntry {
  return createLogEntry('success', message, undefined, agentSource)
}

/**
 * Create a sub-agent log entry for tracking sub-agent lifecycle events
 */
export function createSubAgentLog(
  message: string,
  subAgentName: string,
  parentAgent: string,
  subAgentId?: string,
): LogEntry {
  return createLogEntry('subagent', message, undefined, {
    name: subAgentName,
    isSubAgent: true,
    parentAgent,
    subAgentId,
  })
}
