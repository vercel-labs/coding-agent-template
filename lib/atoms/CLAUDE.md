# Atoms Module

## Domain Purpose
Jotai client-side state atoms: user session, GitHub cache, task state, UI dialogs, and multi-repo selection. Single source of truth for app-wide React state.

## Module Boundaries
- **Owns**: Atom definitions, initial state values, type definitions
- **Delegates to**: Jotai for state subscription/update logic, React components for atom consumption

## Local Patterns
- **Atom Naming**: Kebab-case filename → camelCase atom export (e.g., `session.ts` → `sessionAtom`)
- **Type Safety**: Import types from `lib/db/schema`, `lib/session/types`, etc.; define explicit atom types
- **No Logic**: Atoms are data containers only; derive state via selectors in components
- **Atom Composition**: Complex state uses multiple atoms (e.g., `sessionAtom` + `sessionInitializedAtom`)
- **Initialization**: Atoms initialized with default values; hydrated from API/localStorage in root layout

## Integration Points
- `app/layout.tsx` - Initialize atoms from session/API
- `components/` - Read/write atoms via `useAtom()`, `useAtomValue()`, `useSetAtom()`
- GitHub operations initialize `githubCacheAtom` and `githubConnectionAtom`

## Key Files
- `session.ts` - User session state + initialization flag
- `task.ts` - Current task state during execution
- `github-cache.ts`, `github-connection.ts` - GitHub repository and auth state
- `agent-selection.ts`, `multi-repo.ts`, `connector-dialog.ts`, `file-browser.ts` - UI state atoms
