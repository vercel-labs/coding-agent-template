# components/

## Domain Purpose
- Client-side React components with shadcn/ui primitives, Jotai state, and responsive layouts (all use `'use client'`)

## Local Patterns
- **Naming**: kebab-case.tsx files (task-form.tsx, api-keys-dialog.tsx, app-layout.tsx)
- **Organization**: `ui/` (shadcn primitives), `icons/`, `logos/`, `auth/`, `connectors/`, `providers/`, root (feature components)
- **State Layers**: Jotai atoms from @lib/atoms/ via useAtom(), React Context (TasksContext, ConnectorsContext), local useState
- **Dialog Pattern**: `{ open, onOpenChange }` props passed to Dialog component
- **Provider Hierarchy**: JotaiProvider → SessionProvider → ConnectorsProvider → AppLayout → Theme (app-layout-wrapper.tsx)
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

## Key Files
- **task-form.tsx** - Agent/model selector, prompt input, sandbox options (790 lines)
- **api-keys-dialog.tsx** - API key management, token creation, MCP configuration (598 lines)
- **app-layout.tsx** - Main layout with resizable sidebar, TasksContext provider (374 lines)
