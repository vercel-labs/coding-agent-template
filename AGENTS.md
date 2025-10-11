# AI Agent Guidelines

This document contains critical rules and guidelines for AI agents working on this codebase.

## Security Rules

### CRITICAL: No Dynamic Values in Logs

**All log statements MUST use static strings only. NEVER include dynamic values, regardless of severity.**

#### Bad Examples (DO NOT DO THIS):
```typescript
// BAD - Contains dynamic values
await logger.info(`Task created: ${taskId}`)
await logger.error(`Failed to process ${filename}`)
console.log(`User ${userId} logged in`)
console.error(`Error for ${provider}:`, error)
```

#### Good Examples (DO THIS):
```typescript
// GOOD - Static strings only
await logger.info('Task created')
await logger.error('Failed to process file')
console.log('User logged in')
console.error('Error occurred:', error)
```

#### Rationale:
- **Prevents data leakage**: Dynamic values in logs can expose sensitive information (user IDs, file paths, credentials, etc.) to end users
- **Security by default**: Logs are displayed directly in the UI and returned in API responses
- **No exceptions**: This applies to ALL log levels (info, error, success, command, console.log, console.error, console.warn, etc.)

#### Sensitive Data That Must NEVER Appear in Logs:
- API keys and tokens (ANTHROPIC_API_KEY, OPENAI_API_KEY, GITHUB_TOKEN, etc.)
- Vercel credentials (VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID)
- User IDs and personal information
- File paths and repository URLs
- Branch names and commit messages
- Error details that may contain sensitive context
- Any dynamic values that could reveal system internals

### Credential Redaction

The `redactSensitiveInfo()` function in `lib/utils/logging.ts` automatically redacts known sensitive patterns, but this is a **backup measure only**. The primary defense is to never log dynamic values in the first place.

#### Current Redaction Patterns:
- API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
- Vercel credentials (VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID)
- Bearer tokens
- JSON fields (teamId, projectId)
- Environment variables containing KEY, TOKEN, SECRET, PASSWORD, TEAM_ID, PROJECT_ID

## Code Quality Guidelines

### Logging Best Practices

1. **Use descriptive static messages**
   ```typescript
   // Instead of logging the value, log the action
   await logger.info('Sandbox created successfully')
   await logger.info('Dependencies installed')
   await logger.error('Build failed')
   ```

2. **Server-side logging for debugging**
   ```typescript
   // Use console.error for server-side debugging (not shown to users)
   // But still avoid sensitive data
   console.error('Sandbox creation error:', error)
   ```

3. **Progress updates**
   ```typescript
   // Use static progress messages
   await logger.updateProgress(50, 'Installing dependencies')
   await logger.updateProgress(75, 'Running build')
   ```

### Error Handling

1. **Generic error messages to users**
   ```typescript
   await logger.error('Operation failed')
   // NOT: await logger.error(`Operation failed: ${error.message}`)
   ```

2. **Detailed server-side logging**
   ```typescript
   console.error('Detailed error for debugging:', error)
   // This appears in server logs, not user-facing logs
   ```

## Testing Changes

When making changes that involve logging:

1. **Search for dynamic values**
   ```bash
   # Check for logger statements with template literals
   grep -r "logger\.(info|error|success|command)\(\`.*\$\{" .
   
   # Check for console statements with template literals
   grep -r "console\.(log|error|warn|info)\(\`.*\$\{" .
   ```

2. **Verify no sensitive data exposure**
   - Test the feature in the UI
   - Check the logs displayed to users
   - Ensure no sensitive information is visible

## Configuration Security

### Environment Variables

Never expose these in logs or to the client:
- `VERCEL_TOKEN` - Vercel API token
- `VERCEL_TEAM_ID` - Vercel team identifier
- `VERCEL_PROJECT_ID` - Vercel project identifier
- `ANTHROPIC_API_KEY` - Anthropic/Claude API key
- `OPENAI_API_KEY` - OpenAI API key
- `GITHUB_TOKEN` - GitHub API token
- `JWE_SECRET` - Encryption secret
- `ENCRYPTION_KEY` - Encryption key
- Any user-provided API keys

### Client-Safe Variables

Only these variables should be exposed to the client (via `NEXT_PUBLIC_` prefix):
- `NEXT_PUBLIC_AUTH_PROVIDERS` - Available auth providers
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` - GitHub OAuth client ID (public)

## Compliance Checklist

Before submitting changes, verify:

- [ ] No template literals with `${}` in any log statements
- [ ] All logger calls use static strings
- [ ] All console calls use static strings (for user-facing logs)
- [ ] No sensitive data in error messages
- [ ] Tested in UI to confirm no data leakage
- [ ] Server-side debugging logs don't expose credentials

## Questions?

If you need to log information for debugging purposes:
1. Use server-side console logs (not shown to users)
2. Still avoid logging sensitive credentials
3. Consider adding better error handling instead of logging details
4. Use generic user-facing messages

---

**Remember: When in doubt, use a static string. No exceptions.**

