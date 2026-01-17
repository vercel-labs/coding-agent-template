# Auth Components

## Domain Purpose
OAuth sign-in/sign-out flows, session initialization with Jotai atoms, GitHub connection status, provider detection (GitHub/Vercel).

## Module Boundaries
- **Owns**: UI for OAuth callbacks, user display, session initialization component
- **Delegates to**: `lib/atoms/session` for session atom definitions, `lib/auth/providers.ts` for provider detection, `app/api/auth/` for OAuth flows and session data

## Local Patterns
- **SignIn Component**: Dialog wrapper with conditional GitHub/Vercel buttons based on `getEnabledAuthProviders()` (136 lines)
- **SignOut Component**: Button triggers `/api/auth/signout` and redirects to home
- **Session Provider**: Non-rendering component that fetches session + GitHub connection via `/api/auth/` and updates Jotai atoms; refreshes every 60s or on window focus
- **User Component**: Displays current user info or loading state via sessionAtom hook
- **OAuth Handlers**: `window.location.href` redirects for GitHub/Vercel OAuth flows

## Integration Points
- `app/api/auth/info` - Fetch session user data
- `app/api/auth/github/status` - Fetch GitHub connection status
- `lib/atoms/session.ts` - sessionAtom, sessionInitializedAtom
- `lib/atoms/github-connection.ts` - githubConnectionAtom, githubConnectionInitializedAtom
- `app/layout.tsx` - SessionProvider placed at root for early initialization

## Key Files
- `sign-in.tsx` - OAuth sign-in dialog with GitHub/Vercel buttons (136 lines)
- `session-provider.tsx` - Jotai atom initializer with session fetch + refresh (63 lines)
- `sign-out.tsx` - Sign-out button and logout handler
- `user.tsx` - User profile display component
