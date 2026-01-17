# Auth Components

## Domain Purpose
OAuth sign-in/sign-out flows, session management via React Context, provider detection (GitHub/Vercel).

## Module Boundaries
- **Owns**: UI for OAuth callbacks, user display, session provider context
- **Delegates to**: `lib/session/` for redirect logic, `lib/auth/providers.ts` for provider detection, `app/api/auth/` for OAuth flows

## Local Patterns
- **SignIn Component**: Dialog wrapper with conditional GitHub/Vercel buttons based on `getEnabledAuthProviders()`
- **SignOut Component**: Button triggers `/api/auth/signout` and redirects to home
- **Session Provider**: React Context wrapper (from @auth/core or similar) passed to parent layout
- **User Component**: Displays current user info or loading state via useSession hook
- **OAuth Handlers**: `window.location.href` redirects for GitHub/Vercel OAuth flows

## Integration Points
- `app/api/auth/signin/[provider]/route.ts` - OAuth callback redirects
- `lib/session/redirect-to-sign-in.ts` - Server-side redirect on auth failure
- `lib/auth/providers.ts` - `getEnabledAuthProviders()` for GitHub/Vercel configuration
- `components/app-layout.tsx` - SessionProvider wraps entire app

## Key Files
- `sign-in.tsx` - OAuth sign-in dialog (30 lines, conditional provider buttons)
- `session-provider.tsx` - React Context provider for session state
- `sign-out.tsx` - Sign-out button and logout handler
- `user.tsx` - User profile display component
