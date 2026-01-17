# Vercel Client Module

## Domain Purpose
Vercel API HTTP client wrapper: user/team lookups, project management, and billing info. Used for OAuth integration and Vercel account metadata.

## Module Boundaries
- **Owns**: HTTP requests to Vercel API, response parsing, fallback endpoint handling, type definitions
- **Delegates to**: Native `fetch()` for HTTP, OAuth token passed from `lib/session/` or auth routes

## Local Patterns
- **Endpoint Fallback**: Try v2 endpoint first → Fall back to /api/www endpoint on 404/error
- **Response Parsing**: Extract user/team from nested structure or direct payload (formats vary by endpoint)
- **Bearer Token**: All requests use `Authorization: Bearer <accessToken>` header
- **Cache Disabled**: Set `cache: 'no-store'` on all fetches (fresh metadata per request)
- **Graceful Degradation**: Return undefined on any error; log endpoint details for debugging

## Integration Points
- `app/api/auth/callback/vercel` - Fetch user info after Vercel OAuth
- `app/api/auth/callback/github` - Vercel users connecting GitHub
- `lib/session/create.ts` - User metadata during session creation

## Key Files
- `types.ts` - TypeScript interfaces: VercelUser, VercelTeam, Billing, BillingPlan
- `user.ts` - `fetchUser()` (v2/www fallback)
- `teams.ts`, `projects.ts` - Team and project endpoints
