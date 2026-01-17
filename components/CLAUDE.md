# components/ - UI Component Patterns & Architecture

This directory contains all React 19 UI components using Next.js 15 App Router with shadcn/ui integration.

## Directory Structure

- **`ui/`** - shadcn/ui primitive components (button, dialog, input, select, textarea, etc.)
- **`icons/`** - Custom SVG icon components (provider icons, system icons)
- **`logos/`** - Agent logo components (Claude, Codex, Copilot, Cursor, Gemini, OpenCode)
- **`auth/`** - Authentication components (sign-in, sign-out, user menu, session provider)
- **`connectors/`** - MCP connector management components
- **`providers/`** - Context providers (Jotai, Theme, Session)
- **Root components** - Feature-specific components (task-form, api-keys-dialog, repo-layout, etc.)

## Core Patterns

### 1. Client Components (All Components)
- All components use `'use client'` directive (React 19 required)
- No server-side rendering optimizations in this directory
- Heavy reliance on React hooks (useState, useEffect, useCallback, useContext, useRef)

### 2. State Management Layers

**Global State (Jotai atoms** via @lib/atoms/):
- `taskPromptAtom` - Task description input
- `lastSelectedAgentAtom` - Saved agent selection
- `lastSelectedModelAtomFamily(agent)` - Model per agent
- `githubReposAtomFamily(owner)` - GitHub repos cache
- `sessionAtom` - User session info
- `githubConnectionAtom` - GitHub connection status
- `taskChatInputAtomFamily(taskId)` - Chat input per task

**React Context**:
- `TasksContext` - Task CRUD, sidebar toggle, optimistic updates (app-layout.tsx)
- `ConnectorsContext` - MCP connector management (connectors-provider.tsx)

**Local State** (useState):
- Form inputs, UI toggles, loading states, dialogs
- No form validation library in components - Zod used in API routes only

### 3. shadcn/ui Usage

**Always use shadcn components** - they're composable, accessible, and pre-styled:
- Dialogs: Dialog, AlertDialog
- Forms: Input, Textarea, Select, Checkbox, Label, RadioGroup, Switch
- Data Display: Card, Badge, Table, Tabs, Accordion
- Feedback: Toast (Sonner), Progress
- Navigation: Dropdown Menu, Tooltip
- Layout: Can be layered with Tailwind

**When shadcn component doesn't fit** (rare), extend it using Tailwind CSS classes or create a thin wrapper.

### 4. Dialog & Modal Patterns

All dialogs follow this pattern:
```typescript
'use client'

interface ComponentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // ... other props
}

export function Component({ open, onOpenChange, ... }: ComponentProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>...</DialogContent>
    </Dialog>
  )
}
```

**Key Components**:
- `api-keys-dialog.tsx` - API key management with show/hide toggle, token creation, MCP config
- `merge-pr-dialog.tsx` - PR merge method selection
- `create-pr-dialog.tsx` - PR creation with diff preview
- `task-chat.tsx` - Task follow-up messages and PR status

### 5. Form Patterns

**task-form.tsx** (790 lines - largest component):
- Multi-agent support with dynamic model selection per agent
- Agent & model selection via Select components
- Option chips (Badge) for non-default settings
- API key requirement validation before submission
- Keyboard shortcuts: Enter=submit (desktop), Shift+Enter=newline
- Responsive design: mobile collapses options to dropdown

**Key Features**:
- Prompt textarea with auto-focus via useRef
- Conditional rendering for multi-agent vs single agent
- Save selections to cookies for persistence
- Toast notifications for errors

### 6. Layout Components

**AppLayout** (app-layout.tsx):
- Main layout with resizable sidebar (200-600px width)
- Context provider for task management
- Sidebar resize via mouse drag
- Mobile: auto-collapse on resize
- Keyboard shortcut: Ctrl/Cmd+B to toggle

**RepoLayout** (repo-layout.tsx):
- Nested layout for repo pages (commits, issues, pull-requests)
- Tab navigation with active state styling
- Quick task creation button

**PageHeader** (page-header.tsx):
- Reusable header with left/right action slots
- Mobile menu toggle button

### 7. Provider Hierarchy

**Root-level setup** (app-layout-wrapper.tsx):
```
JotaiProvider
  → SessionProvider (Jotai atoms for user session)
    → ConnectorsProvider (MCP connectors context)
      → AppLayout (Tasks context)
        → Theme (next-themes)
```

Cookies store: sidebar width, sidebar open state, agent/model selection, sandbox options.

### 8. Responsive Design

- Tailwind breakpoints: `sm:`, `md:`, `lg:` (lg=1024px for desktop/mobile split)
- Mobile-first approach with tailwind classes
- Hidden classes for mobile-specific hide: `hidden sm:inline`, `hidden lg:block`
- Flexible layouts: `flex-1`, `min-w-0`, `truncate` for proper text wrapping

### 9. Icons & Assets

**Icon Components**:
- `icons/` - System icons (provider-specific, MCP symbols)
- `logos/` - Agent logo components (return SVG elements)
- Third-party: Lucide React for UI icons (Arrow, Settings, Copy, Loader2, etc.)

### 10. Accessibility & UX

- **Labels**: All inputs have associated `<Label htmlFor>` tags
- **Tooltips**: Hover hints for icon-only buttons via TooltipProvider
- **Keyboard Navigation**: Dialogs, dropdowns, forms fully keyboard accessible
- **Loading States**: Disabled buttons with spinner icons during async operations
- **Error Handling**: Toast notifications (sonner) for user feedback
- **Aria Labels**: Buttons with aria-label for screen readers

## Integration Points

### API Routes Called from Components
- `/api/api-keys` - Get/save/clear API keys
- `/api/api-keys/check` - Validate API key for agent/model combo
- `/api/tasks` - Create/list/fetch tasks
- `/api/tasks/[id]/*` - Task operations (merge-pr, delete, follow-up)
- `/api/tokens` - Create/list/delete API tokens
- `/api/connectors` - List MCP connectors
- `/api/github/*` - GitHub repo/org access

### Environment & Feature Flags
- Cookie-based user preferences (agent, model, sandbox options)
- SessionProvider fetches `/api/auth/info` on mount
- No environment variables used in components - all config from API

### Event Listeners
- Window resize → responsive sidebar behavior
- Keyboard shortcuts → Ctrl/Cmd+B (toggle sidebar), Enter (submit form)
- Focus events → SessionProvider auto-refresh

## Code Quality Standards

- **TypeScript**: Strict mode enforced, all props typed with interfaces
- **Naming**: `Component` + `Props` suffix for interfaces
- **Comments**: Minimal comments - code is self-documenting via clear naming
- **No Log Statements**: NEVER log dynamic values (see CLAUDE.md root)
- **Imports**: Path aliases via `@/` for clarity and refactoring

## Key Large Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| task-form.tsx | 790 | Agent/model selection, prompt input, options management |
| api-keys-dialog.tsx | 598 | API key management, token generation, MCP config |
| app-layout.tsx | 374 | Main layout with sidebar, tasks context |
| task-chat.tsx | 300+ | Task follow-up messages, PR status, agent communication |
| file-browser.tsx | 300+ | File tree navigation, diff preview, file operations |
| repo-layout.tsx | 129 | Repo page layout with tab navigation |

## Common Pitfalls to Avoid

1. **Don't mix validation logic** - Form validation happens in API routes (Zod), not components
2. **Don't log dynamic values** - Use static strings only (see root CLAUDE.md Security section)
3. **Don't create long-lived intervals** - Clean up intervals in useEffect return
4. **Don't forget mobile optimization** - All interactive elements must be touch-friendly (min 44px height)
5. **Don't hardcode colors** - Use Tailwind CSS tokens (bg-primary, text-muted-foreground, etc.)

## Related Files

- **@lib/atoms/** - Jotai state definitions (see task.ts, session.ts, agent-selection.ts)
- **@lib/utils/cookies.ts** - Cookie helpers for persistence
- **@lib/auth/session.ts** - User session utilities
- **@lib/db/schema.ts** - TypeScript types for DB models
- **@CLAUDE.md** (root) - Complete project guidelines including security rules
- **@shadcn/ui** - https://ui.shadcn.com/ - Full component library reference
