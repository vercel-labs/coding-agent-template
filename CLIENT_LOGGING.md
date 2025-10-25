# Client-Side Logging

This document explains how to use client-side logging in the application to capture and display logs from the browser UI alongside server-side logs.

## Overview

The client logging system allows you to send logs from the browser (React components) to the server, where they are stored in the task's log database and displayed in the logs pane with a `[CLIENT]` prefix.

## Components

### 1. Client Logger (`lib/utils/client-logger.ts`)

The core logger class that batches logs and sends them to the server:

```typescript
import { createClientLogger } from '@/lib/utils/client-logger'

const logger = createClientLogger('task-id')

// Log different types of messages
logger.info('User clicked button')
logger.command('npm install')
logger.error('Failed to load data')
logger.success('Operation completed')

// Flush any pending logs immediately
logger.flush()
```

**Features:**
- Automatic batching: Logs are sent in batches every 500ms or when 10 logs accumulate
- Type-safe: Uses the same `LogEntry` types as server-side logging
- No sensitive data: All logs are redacted server-side before storage

### 2. React Hook (`lib/hooks/use-client-logger.ts`)

A React hook for easy integration into components:

```typescript
import { useClientLogger } from '@/lib/hooks/use-client-logger'

function MyComponent({ taskId }) {
  const clientLogger = useClientLogger(taskId)

  const handleClick = () => {
    clientLogger.info('Button clicked')
    // ... handle click
  }

  useEffect(() => {
    clientLogger.info('Component mounted')
    return () => {
      clientLogger.flush() // Flush on unmount
    }
  }, [])

  return <button onClick={handleClick}>Click me</button>
}
```

**Features:**
- Automatic cleanup: Flushes pending logs when component unmounts
- Safe API: All methods check if logger is initialized before calling
- Memoized callbacks: Prevents unnecessary re-renders

### 3. API Endpoint (`app/api/tasks/[taskId]/client-logs/route.ts`)

The server endpoint that receives client logs:

- **Route:** `POST /api/tasks/[taskId]/client-logs`
- **Authentication:** Requires valid session
- **Authorization:** Verifies task ownership
- **Validation:** Uses Zod schema to validate log entries
- **Security:** Redacts sensitive information using `redactSensitiveInfo()`

### 4. Logs Pane (`components/logs-pane.tsx`)

The UI component displays logs with filtering:

- **All**: Shows all logs (platform, server, and client)
- **Platform**: Shows only platform logs (no prefix)
- **Server**: Shows only `[SERVER]` logs
- **Client**: Shows only `[CLIENT]` logs (NEW)

Client logs are displayed with a blue `[CLIENT]` prefix to distinguish them from server logs (purple).

## Usage Examples

### Example 1: Log Component Lifecycle Events

```typescript
function TaskComponent({ taskId }) {
  const clientLogger = useClientLogger(taskId)

  useEffect(() => {
    clientLogger.info('Task view loaded')
  }, [clientLogger])

  useEffect(() => {
    if (taskId) {
      clientLogger.info('Task ID changed')
    }
  }, [taskId, clientLogger])

  return <div>Task content</div>
}
```

### Example 2: Log User Interactions

```typescript
function FileEditor({ taskId, filename }) {
  const clientLogger = useClientLogger(taskId)

  const handleSave = async () => {
    clientLogger.info('Save button clicked')
    try {
      await saveFile()
      clientLogger.success('File saved successfully')
    } catch (error) {
      clientLogger.error('Failed to save file')
    }
  }

  return <button onClick={handleSave}>Save</button>
}
```

### Example 3: Log Navigation Events

```typescript
function TaskTabs({ taskId }) {
  const clientLogger = useClientLogger(taskId)
  const [activeTab, setActiveTab] = useState('code')

  const handleTabChange = (tab: string) => {
    clientLogger.info(`Switched to tab: ${tab}`)
    setActiveTab(tab)
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="code">Code</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
```

### Example 4: Log Performance Metrics

```typescript
function PreviewPane({ taskId }) {
  const clientLogger = useClientLogger(taskId)

  useEffect(() => {
    const startTime = performance.now()

    // Load preview
    loadPreview().then(() => {
      const duration = Math.round(performance.now() - startTime)
      clientLogger.info(`Preview loaded`)
    })
  }, [clientLogger])

  return <iframe src="/preview" />
}
```

## Security Considerations

### IMPORTANT: Static Messages Only

Just like server-side logging, client logs **MUST use static strings only**. Never include dynamic values in log messages:

```typescript
// ❌ BAD - Contains dynamic values
clientLogger.info(`User ${userId} opened file ${filename}`)
clientLogger.error(`API error: ${error.message}`)

// ✅ GOOD - Static strings only
clientLogger.info('User opened file')
clientLogger.error('API request failed')
```

### Sensitive Data Protection

All client logs are automatically redacted on the server using `redactSensitiveInfo()` before being stored, but you should **never log sensitive data in the first place**:

- ❌ User IDs, emails, or personal information
- ❌ Authentication tokens or API keys
- ❌ File paths or repository URLs
- ❌ Error messages with sensitive context

### Rate Limiting

Client logs are batched and sent at most:
- Every 500ms (time-based batching)
- When 10 logs accumulate (size-based batching)
- When component unmounts (explicit flush)

This prevents excessive API calls and server load.

## Log Types

The logger supports four log types, each with different visual styling:

| Type | Color | Use Case |
|------|-------|----------|
| `info` | White | General information, status updates |
| `command` | Cyan | Command execution (e.g., terminal commands) |
| `error` | Red | Error messages, failures |
| `success` | Green | Successful operations, completions |

## Debugging

### View Logs in Browser Console

All client logs are also sent to the browser console for debugging:

```typescript
logger.info('Hello')     // console.log('[CLIENT] Hello')
logger.command('test')   // console.log('[CLIENT] $ test')
logger.error('Failed')   // console.error('[CLIENT] Failed')
logger.success('Done')   // console.log('[CLIENT] ✓ Done')
```

### View Logs in Database

Client logs are stored in the `tasks` table, `logs` column (JSONB array):

```sql
SELECT id, logs FROM tasks WHERE id = 'task-id';
```

### View Logs in UI

1. Navigate to the task page
2. Open the logs pane at the bottom
3. Use the filter dropdown to select "Client" or "All"
4. Client logs appear with a blue `[CLIENT]` prefix

## Best Practices

1. **Use sparingly**: Only log important events, not every render or state change
2. **Be descriptive**: Use clear, concise messages that explain what happened
3. **Flush on unmount**: Always flush logs when components unmount to ensure they're sent
4. **Batch operations**: When logging multiple related events, consider if they should be combined
5. **Test in production**: Client logs are most useful in production to understand user behavior

## Integration Checklist

When adding client logging to a new component:

- [ ] Import `useClientLogger` hook
- [ ] Get `taskId` from props or context
- [ ] Call `useClientLogger(taskId)` to get logger instance
- [ ] Add `clientLogger.info()` calls for important events
- [ ] Use static strings only (no dynamic values)
- [ ] Consider adding `flush()` in cleanup if needed
- [ ] Test that logs appear in the logs pane with `[CLIENT]` prefix
- [ ] Verify logs are filtered correctly when selecting "Client" filter

## Future Enhancements

Possible future improvements:

1. **Client-side log level filtering**: Filter logs by type before sending to server
2. **Structured logging**: Support structured data (JSON) for better analysis
3. **Performance monitoring**: Built-in performance metric tracking
4. **Error boundaries**: Automatic error logging from React error boundaries
5. **Replay functionality**: Record and replay user sessions for debugging
6. **Analytics integration**: Send logs to analytics platforms

---

**Remember: When in doubt, use a static string. No exceptions.**
