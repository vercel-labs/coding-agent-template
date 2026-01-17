# Providers

## Domain Purpose
React Context/Provider wrappers for global application state: Jotai atom store initialization.

## Module Boundaries
- **Owns**: Provider wrapping logic, initialization of Jotai store
- **Delegates to**: jotai library for state management, parent app for context composition
- **Parent handles**: Provider hierarchy stacking in app-layout-wrapper.tsx

## Local Patterns
- **Jotai Provider**: Single provider wrapping entire app with Jotai atom store
- **Children Passthrough**: Accepts and renders `children` for composition
- **Initialization**: No complex setup, just wraps Provider from jotai library
- **Use Client**: `'use client'` directive since Jotai is client-side state

## Integration Points
- `app/layout.tsx` or `app-layout-wrapper.tsx` - Placed at top of provider stack
- `lib/atoms/` - All atom definitions accessible within provider scope
- Jotai hooks (useAtom, useSetAtom, useAtomValue) used in descendant components

## Key Files
- `jotai-provider.tsx` - Simple wrapper (8 lines) around `<Provider>` from jotai
- No complex logic; pure composition wrapper
