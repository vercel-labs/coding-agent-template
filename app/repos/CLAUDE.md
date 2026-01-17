# app/repos - Repository Browser Pages

Provides UI for browsing GitHub repositories with detailed views: commits, issues, pull requests. Uses nested routing with shared layout and tab-based navigation.

## Domain Purpose
Display rich repository metadata from GitHub API: commit history, issue lists, PR tracking. Acts as secondary browsing interface (primary: task management pages in `app/tasks`).

## Directory Structure

```
app/repos/[owner]/[repo]/
├── layout.tsx                      # Shared layout with tab navigation
├── page.tsx                        # Redirect to commits tab
├── commits/
│   └── page.tsx                   # Commit history view
├── issues/
│   └── page.tsx                   # Issues list view
└── pull-requests/
    ├── page.tsx                   # PR list view
    └── [pr_number]/
        └── check-task/
            └── route.ts           # API endpoint
```

## Routes & Pages

### Layout (`layout.tsx`)
- Renders tab navigation (commits, issues, pull-requests)
- Passes `owner`, `repo`, `user` session, `initialStars` to RepoLayout component
- Generates dynamic metadata for SEO

### Commits Tab (`commits/page.tsx`)
- Displays commit history
- Shows: hash, message, author, date
- Calls: `GET /api/repos/[owner]/[repo]/commits`
- Component: `RepoCommits` in `components/repo-commits.tsx`

### Issues Tab (`issues/page.tsx`)
- Lists open/closed issues
- Shows: title, status, author, creation date
- Calls: `GET /api/repos/[owner]/[repo]/issues`
- Component: `RepoIssues` in `components/repo-issues.tsx`

### Pull Requests Tab (`pull-requests/page.tsx`)
- Lists pull requests with status
- Shows: title, state, author, merge status, checks
- Calls: `GET /api/repos/[owner]/[repo]/pull-requests`
- Component: `RepoPullRequests` in `components/repo-pull-requests.tsx`

## Key Patterns

### Dynamic Routing
```typescript
// params available via Promise (Next.js 15+)
const { owner, repo } = await params
```

### Session & Auth
```typescript
const session = await getServerSession()
const user = session?.user ?? null  // Can be null (public access allowed)
```

### GitHub API Integration
- Fetch real-time data on each page load
- No local caching (always fresh)
- Uses authenticated GitHub token if available
- Falls back to unauthenticated if user has no GitHub connected

### Metadata Generation
```typescript
export async function generateMetadata({ params }) {
  const { owner, repo } = await params
  return {
    title: `${owner}/${repo} - Coding Agent Platform`,
    description: 'View repository commits, issues, and pull requests',
  }
}
```

## Component Integration

### RepoLayout Component
- Renders tab bar with active state
- Handles navigation between tabs
- Shows repo name, description, stars
- Accepts: owner, repo, user, authProvider, initialStars

### Page Components
- Located in `components/repo-[name].tsx`
- Receive: owner, repo, user session
- Handle loading, error states
- Display data from API routes

## API Routes

### /api/repos/[owner]/[repo]/commits
GET request, returns commit list with pagination.

### /api/repos/[owner]/[repo]/issues
GET request, returns issues with status filtering.

### /api/repos/[owner]/[repo]/pull-requests
GET request, returns PRs with status, check runs.

### /api/repos/[owner]/[repo]/pull-requests/[pr_number]/check-task
GET request, checks if PR has associated AA task.

## Database Interactions

### Minimal Local Data
- Repos don't store data locally
- All info fetched live from GitHub API
- Only tasks table tracks repo URLs

### Task Association
- Tasks store: `repoUrl`, `branchName`, `prNumber`, `prUrl`
- PR check endpoint maps PR back to task

## Navigation Flow

1. User navigates to `/repos/[owner]/[repo]`
2. Layout fetches session + stars
3. Redirects to `commits` tab (page.tsx does redirect)
4. RepoLayout renders tab bar + children
5. CommitsPage fetches and displays commits
6. User clicks tab to switch view

## Security Notes

- Public access allowed (no auth required for GitHub API)
- If user authenticated with GitHub, uses their token (higher rate limits)
- If not, uses unauthenticated access (60 req/hr limit)
- No sensitive data stored locally

## Integration Points

- **GitHub API**: Fetches commits, issues, PRs, check runs
- **Authentication**: Optional (for higher rate limits)
- **Components**: Reusable repo display components
- **Tasks**: Link back to tasks created for this repo

## Styling

- Uses Tailwind CSS
- shadcn/ui components for consistency
- Dark mode support via `dark:` classes
- Responsive layout for mobile/desktop

## Error Handling

- If repo not found: 404 page
- If GitHub API fails: Error message with retry
- If no commits/issues/PRs: Empty state message
- Rate limit exceeded: User-friendly message

## Adding New Tabs

To add a new repository view tab:

1. Create `app/repos/[owner]/[repo]/[tab-name]/page.tsx`
2. Create component `components/repo-[tab-name].tsx`
3. Create API route `app/api/repos/[owner]/[repo]/[tab-name]/route.ts`
4. Add to `tabs` array in `components/repo-layout.tsx`
5. Update layout metadata if needed
