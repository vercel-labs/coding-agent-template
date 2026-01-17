# Dual-Auth Migration Plan

## Objective
Migrate 30+ task operation routes from session-only to dual-auth (Bearer token + session) to enable full MCP client access.

## Affected Routes
All routes in `/app/api/tasks/[taskId]/` except:
- `route.ts` (already migrated)
- `continue/route.ts` (already migrated)

## Migration Pattern

### Before (Session-Only)
```typescript
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  // ...
}
```

### After (Dual-Auth)
```typescript
import { getAuthFromRequest } from '@/lib/auth/api-token'

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthFromRequest(request)
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id
  // ...
}
```

## Implementation Steps

1. **Update imports:**
   ```typescript
   - import { getServerSession } from '@/lib/session/get-server-session'
   + import { getAuthFromRequest } from '@/lib/auth/api-token'
   ```

2. **Update auth logic:**
   ```typescript
   - const session = await getServerSession()
   - if (!session?.user?.id) {
   + const user = await getAuthFromRequest(request)
   + if (!user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }
   ```

3. **Update userId references:**
   ```typescript
   - session.user.id
   + user.id
   ```

4. **For routes that need MCP servers (rare):**
   - Keep `getServerSession()` for MCP connector access
   - Use both auth methods:
   ```typescript
   const user = await getAuthFromRequest(request)
   if (!user?.id) return /* ... */

   // Only if MCP servers needed:
   const session = await getServerSession()
   let mcpServers = []
   if (session?.user?.id) {
     mcpServers = await db.select()...
   }
   ```

## Testing Checklist
- [ ] Session cookie auth still works (web UI)
- [ ] Bearer token auth works (MCP clients)
- [ ] User-scoped queries intact (filter by userId)
- [ ] Error responses consistent (401 for unauth)
- [ ] Type checks pass (`pnpm type-check`)
- [ ] Linting passes (`pnpm lint`)

## Routes to Migrate (30)
- [ ] `/api/tasks/[taskId]/messages`
- [ ] `/api/tasks/[taskId]/pr`
- [ ] `/api/tasks/[taskId]/files`
- [ ] `/api/tasks/[taskId]/deployment`
- [ ] `/api/tasks/[taskId]/file-content`
- [ ] `/api/tasks/[taskId]/save-file`
- [ ] `/api/tasks/[taskId]/create-file`
- [ ] `/api/tasks/[taskId]/delete-file`
- [ ] `/api/tasks/[taskId]/diff`
- [ ] `/api/tasks/[taskId]/sync-pr`
- [ ] `/api/tasks/[taskId]/merge-pr`
- [ ] `/api/tasks/[taskId]/close-pr`
- [ ] `/api/tasks/[taskId]/reopen-pr`
- [ ] `/api/tasks/[taskId]/check-runs`
- [ ] `/api/tasks/[taskId]/clear-logs`
- [ ] `/api/tasks/[taskId]/sandbox-health`
- [ ] `/api/tasks/[taskId]/start-sandbox`
- [ ] `/api/tasks/[taskId]/terminal`
- [ ] `/api/tasks/[taskId]/lsp`
- [ ] `/api/tasks/[taskId]/autocomplete`
- [ ] `/api/tasks/[taskId]/project-files`
- [ ] `/api/tasks/[taskId]/file-operation`
- [ ] `/api/tasks/[taskId]/discard-file-changes`
- [ ] `/api/tasks/[taskId]/reset-changes`
- [ ] `/api/tasks/[taskId]/sync-changes`
- [ ] `/api/tasks/[taskId]/restart-dev`
- [ ] `/api/tasks/[taskId]/create-folder`
- [ ] `/api/tasks/[taskId]/pr-comments`
- [ ] `/api/tasks/[taskId]/stop-sandbox`

## Estimated Effort
- Per-route: 2-5 minutes (simple find-replace pattern)
- Total: 1-2.5 hours for all 30 routes
- Testing: +30 minutes

## Delegation Option
Use `api-route-architect` subagent with batch instructions to automate migration.
