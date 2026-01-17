# app/repos

Repository browser with nested routing: commits, issues, pull-requests tabs. Public access, optional authentication.

## Domain Purpose
- Display GitHub repo metadata from live API: commit history, issues, PRs with CI/CD status
- Secondary browsing interface (primary: task pages in app/tasks)
- No local storage; fetch fresh data on each request

## Local Patterns
- **Nested routing**: Layout at `[owner]/[repo]/layout.tsx` with tab navigation; each tab in subdirectory
- **Page redirect**: `[owner]/[repo]/page.tsx` redirects to commits tab
- **Metadata generation**: `generateMetadata()` with dynamic owner/repo
- **Session optional**: `const user = await getServerSession()` can be null for public access

## Directory Structure
```
app/repos/[owner]/[repo]/
├── layout.tsx            # Shared layout + RepoLayout component
├── page.tsx              # Redirect to commits
├── commits/page.tsx      # Component: RepoCommits
├── issues/page.tsx       # Component: RepoIssues
└── pull-requests/page.tsx # Component: RepoPullRequests
```

## Integration Points
- **GitHub API**: Commits, issues, PRs, check runs (via api/repos routes)
- **Task Association**: PR check endpoint maps PR to task
- **Authentication**: Optional (token → 5000/hr limit; unauth → 60/hr limit)
- **Components**: `components/repo-[name].tsx` - receive owner, repo, user session

## Adding New Tabs
1. Create `app/repos/[owner]/[repo]/[tab-name]/page.tsx`
2. Create component `components/repo-[tab-name].tsx`
3. Add API route `app/api/repos/[owner]/[repo]/[tab-name]/route.ts`
4. Add to `tabs` array in `components/repo-layout.tsx`

## Key Files
- `layout.tsx` - Renders RepoLayout (tab bar) + children
- `[owner]/[repo]/page.tsx` - Redirect to commits
- Each tab imports data from `/api/repos/[owner]/[repo]/[tab]/`
