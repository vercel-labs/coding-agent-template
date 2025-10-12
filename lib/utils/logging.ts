import { LogEntry } from '@/lib/db/schema'

export type { LogEntry }

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

export function createLogEntry(type: LogEntry['type'], message: string, timestamp?: Date): LogEntry {
  return {
    type,
    message: redactSensitiveInfo(message),
    timestamp: timestamp || new Date(),
  }
}

export function createInfoLog(message: string): LogEntry {
  return createLogEntry('info', message)
}

export function createCommandLog(command: string, args?: string[]): LogEntry {
  const fullCommand = args ? `${command} ${args.join(' ')}` : command
  return createLogEntry('command', `$ ${fullCommand}`)
}

export function createErrorLog(message: string): LogEntry {
  return createLogEntry('error', message)
}

export function createSuccessLog(message: string): LogEntry {
  return createLogEntry('success', message)
}
