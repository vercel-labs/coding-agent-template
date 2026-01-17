# app

Next.js 16 App Router: UI routing with root layout, providers, and nested page structure.

## Domain Purpose
- Render user interface for task creation, execution, and repository browsing
- Centralize authentication, theme, and state management via root layout
- Support nested layouts for tasks and repos with independent page routing

## Local Patterns
- **Server-side auth**: Pages use `getServerSession()` and redirect to `/` if not authenticated
- **Parallel data fetch**: Root layout and pages fetch session + GitHub stars concurrently
- **Client delegation**: Server pages pass state to client components (TasksListClient, TaskPageClient, etc.)
- **Dynamic metadata**: Pages export `metadata` or call `generateMetadata()` for SEO
- **Promise-based params**: Use `await params` for route parameters (Next.js 15+)

## Directory Structure
- `api/` - REST endpoints (61 routes, see @app/api/CLAUDE.md)
- `tasks/` - Task UI (list page, detail page with [taskId])
- `repos/` - Repository browser (commits, issues, pull-requests tabs)
- `docs/` - Documentation pages (markdown rendering)
- `layout.tsx` - Root layout with Theme, Session, Jotai, Toaster providers
- `page.tsx` - Home page (public, task creation form)

## Integration Points
- **Providers**: Theme, Session, Jotai state, Sonner toast, Vercel Analytics/Speed Insights
- **Session**: `@/lib/session/get-server-session` for auth checks
- **GitHub**: `getGitHubStars()` for all pages
- **UI components**: `@/components/` (server and client)
- **Styling**: `globals.css` + Tailwind CSS v4 + shadcn/ui

## Key Behaviors
- **Auth redirect**: Task pages redirect to home if not authenticated
- **Public home**: Home page (/) accessible without auth, shows task form
- **Public repos**: Repo pages viewable without auth (GitHub rate limit: 60/hr unauth, 5000/hr auth)
- **Nested layouts**: tasks/ and repos/ each have own layout.tsx for tab navigation

## Key Files
- `layout.tsx` - Providers setup
- `page.tsx` - Home page
- `globals.css` - Tailwind + global styles
