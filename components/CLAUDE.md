# components/

## Domain Purpose
- Client-side React components with shadcn/ui primitives, Jotai state, and responsive layouts (all use `'use client'`)

## Local Patterns
- **Naming**: kebab-case.tsx files (task-form.tsx, api-keys-dialog.tsx, app-layout.tsx)
- **Organization**: `ui/` (shadcn primitives), `icons/`, `logos/`, `auth/`, `connectors/`, `providers/`, root (feature components)
- **State Layers**: Jotai atoms from @lib/atoms/ via useAtom(), React Context (TasksContext, ConnectorsContext), local useState
- **Dialog Pattern**: `{ open, onOpenChange }` props passed to Dialog component
- **Provider Hierarchy**: JotaiProvider → ThemeProvider → (SessionProvider + AppLayoutWrapper in parallel) → ConnectorsProvider (inside AppLayout)
- **Context Layers**: TasksContext (from AppLayout) for task/sidebar state, ConnectorsContext for MCP server list
- **Responsive Design**: Mobile-first Tailwind, lg breakpoint (1024px) for desktop/mobile split, `hidden lg:block` patterns
- **Keyboard Shortcuts**: Ctrl/Cmd+B (sidebar toggle), Enter (form submit), Shift+Enter (newline)

## Integration Points
- **shadcn/ui**: All primitives from `components/ui/` (Dialog, Input, Select, Badge, Toast, etc.)
- **Jotai atoms**: taskPromptAtom, lastSelectedAgentAtom, lastSelectedModelAtomFamily, githubReposAtomFamily, sessionAtom, taskChatInputAtomFamily
- **API Routes**: `/api/api-keys`, `/api/tasks/*`, `/api/tokens`, `/api/connectors`, `/api/github/*` (called via fetch from components)
- **Cookies**: Agent/model selection, sidebar width/state, sandbox options (via @lib/utils/cookies.ts)

## Module Boundaries
- **Owns**: All UI rendering, client-side interactions, dialog state, form inputs, Jotai/Context state management
- **Delegates**: API logic to @app/api/, database to Drizzle ORM, server state to @app pages, atoms definitions to @lib/atoms/
- **Parent handles**: Routing (@app), server-side rendering, authentication logic

## Sub-Agent Display
- **sub-agent-indicator.tsx** - Collapsible UI showing sub-agent activity
  - `SubAgentIndicator` - Full display with active/completed sub-agents, status badges, duration
  - `SubAgentIndicatorCompact` - Minimal badge for logs pane header
  - Shows sub-agent name, status (starting/running/completed/error), elapsed time
  - Color-coded by status: amber (starting), blue (running), green (completed), red (error)
  - Displays last heartbeat timestamp via tooltip (indicates timeout extension activity)
  - Accessed via props: `currentSubAgent`, `subAgentActivity`, `lastHeartbeat`

## Log Filtering
- **logs-pane.tsx** - Enhanced log display with sub-agent filtering
  - Filter types: 'all', 'platform', 'server', 'subagent'
  - Sub-agent logs show agent source badge with name
  - `SubAgentIndicatorCompact` displayed in logs pane header when sub-agents active
  - Tabs: 'logs' (filtered task logs) and 'terminal' (raw terminal output)

## Key Files
- **task-form.tsx** - Agent/model selector, prompt input, sandbox options (790 lines)
- **api-keys-dialog.tsx** - API key management, token creation, MCP configuration (597 lines)
- **app-layout.tsx** - Main layout with resizable sidebar, TasksContext and ConnectorsProvider (374 lines)
- **sub-agent-indicator.tsx** - Sub-agent activity display with collapsible details (293 lines)
- **logs-pane.tsx** - Resizable logs panel with sub-agent badges and filtering (350+ lines)
