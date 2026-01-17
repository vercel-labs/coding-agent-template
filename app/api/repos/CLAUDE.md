# app/api/repos

Repository metadata endpoints: commits, issues, pull-requests, CI/CD status checks. Public/semi-public access.

## Domain Purpose
- Fetch GitHub repo metadata from live API for display in repo browser (app/repos/)
- Supports public repos (optional authentication), no local caching
- Integrates with task system: check-task maps PR to task, close-PR returns task status

## Local Patterns
- **Dynamic routing**: `[owner]/[repo]/` structure matches GitHub org/repo naming
- **Pagination**: Default 30 items per page (commits endpoint)
- **Optional auth**: Works with or without user session (token → 5000/hr; unauth → 60/hr GitHub rate limit)
- **Error handling**: Static error messages, no token/path exposure

## Routes
- `[owner]/[repo]/commits/route.ts` - Get repo commits (30 per page)
- `[owner]/[repo]/issues/route.ts` - Get repo issues with optional filter
- `[owner]/[repo]/pull-requests/route.ts` - Get repo PRs (status, check-runs)
- `[owner]/[repo]/pull-requests/[pr_number]/check-task/route.ts` - Map PR → task
- `[owner]/[repo]/pull-requests/[pr_number]/close/route.ts` - Close PR (return task status)

## Integration Points
- **GitHub API**: `getOctokit()` from `@/lib/github/client` (Octokit REST v3)
- **Task system**: check-task returns taskId; close-PR updates task status
- **Session**: Optional `getServerSession()` for authenticated requests
- **Components**: Data consumed by `components/repo-[name].tsx` (commits, issues, pull-requests)

## Key Behaviors
- **Public access**: All endpoints work without authentication (public repo data)
- **Session optional**: Authenticated requests get higher GitHub rate limit (5000/hr vs 60/hr)
- **Check-runs**: PR endpoint includes CI/CD status from GitHub checks
- **Errors**: 401 if user auth required, 404 repo not found, 500 on GitHub API error

## Key Files
- `[owner]/[repo]/commits/route.ts` - Fetch commits with pagination
- `[owner]/[repo]/issues/route.ts` - Fetch issues (filter by state, assignee, etc.)
- `[owner]/[repo]/pull-requests/route.ts` - Fetch PRs with check-run status
- Check-task and close-PR routes: task association logic
