# AI Agent Guidelines

This document contains critical rules and guidelines for AI agents working on this codebase.

## Security Rules

### CRITICAL: No Dynamic Values in Logs

**All log statements MUST use static strings only. NEVER include dynamic values, regardless of severity.**

#### Bad Examples (DO NOT DO THIS):
```typescript
// BAD - Contains dynamic values
await logger.info(`Task created: ${taskId}`)
await logger.error(`Failed to process ${filename}`)
console.log(`User ${userId} logged in`)
console.error(`Error for ${provider}:`, error)
```

#### Good Examples (DO THIS):
```typescript
// GOOD - Static strings only
await logger.info('Task created')
await logger.error('Failed to process file')
console.log('User logged in')
console.error('Error occurred:', error)
```

#### Rationale:
- **Prevents data leakage**: Dynamic values in logs can expose sensitive information (user IDs, file paths, credentials, etc.) to end users
- **Security by default**: Logs are displayed directly in the UI and returned in API responses
- **No exceptions**: This applies to ALL log levels (info, error, success, command, console.log, console.error, console.warn, etc.)

#### Sensitive Data That Must NEVER Appear in Logs:
- Vercel credentials (SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID)
- User IDs and personal information
- File paths and repository URLs
- Branch names and commit messages
- Error details that may contain sensitive context
- Any dynamic values that could reveal system internals

### Credential Redaction

The `redactSensitiveInfo()` function in `lib/utils/logging.ts` automatically redacts known sensitive patterns, but this is a **backup measure only**. The primary defense is to never log dynamic values in the first place.

#### Current Redaction Patterns:
- API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
- Vercel credentials (SANDBOX_VERCEL_TOKEN, SANDBOX_VERCEL_TEAM_ID, SANDBOX_VERCEL_PROJECT_ID)
- Bearer tokens
- JSON fields (teamId, projectId)
- Environment variables containing KEY, TOKEN, SECRET, PASSWORD, TEAM_ID, PROJECT_ID

## Code Quality Guidelines

### Code Formatting and Quality Checks

**Always run `pnpm format`, `pnpm type-check`, and `pnpm lint` after making changes to TypeScript/TSX files.**

The project uses Prettier for code formatting, TypeScript for type checking, and ESLint for linting. After editing any `.ts` or `.tsx` files, run:

```bash
pnpm format
pnpm type-check
pnpm lint
```

**If any errors are found:**
1. **Type errors**: Fix TypeScript type errors by correcting type annotations, adding missing imports, or fixing type mismatches
2. **Lint errors**: Fix ESLint errors by following the suggested fixes or adjusting the code to meet the linting rules
3. **Do not skip or ignore errors** - all errors must be resolved before considering the task complete

This ensures all code follows the project's formatting standards, type safety requirements, and linting rules, preventing issues in pull requests.

### CRITICAL: Never Run Dev Servers

**DO NOT run development servers (e.g., `npm run dev`, `pnpm dev`, `next dev`) as they will conflict with other running instances.**

#### Why This Rule Exists:
- Dev servers run indefinitely and block the terminal session
- Multiple instances on the same port cause conflicts
- The application may already be running in the user's environment
- Long-running processes make the conversation hang for the user

#### Commands to AVOID:
```bash
# DO NOT RUN THESE:
npm run dev
pnpm dev
next dev
npm start
pnpm start
yarn dev
node --watch
nodemon
```

#### What to Do Instead:
1. **Testing changes**: Use `pnpm build` to verify the production build works
2. **Type checking**: Use `pnpm type-check` to verify types
3. **Linting**: Use `pnpm lint` to check code quality
4. **Running tests**: Use `pnpm test` if tests are available
5. **If the user needs to test**: Let the user run the dev server themselves

#### Exception:
If the user explicitly asks you to start a dev server, politely explain why you cannot do this and suggest they run it themselves instead.

### Logging Best Practices

1. **Use descriptive static messages**
   ```typescript
   // Instead of logging the value, log the action
   await logger.info('Sandbox created successfully')
   await logger.info('Dependencies installed')
   await logger.error('Build failed')
   ```

2. **Server-side logging for debugging**
   ```typescript
   // Use console.error for server-side debugging (not shown to users)
   // But still avoid sensitive data
   console.error('Sandbox creation error:', error)
   ```

3. **Progress updates**
   ```typescript
   // Use static progress messages
   await logger.updateProgress(50, 'Installing dependencies')
   await logger.updateProgress(75, 'Running build')
   ```

### Error Handling

1. **Generic error messages to users**
   ```typescript
   await logger.error('Operation failed')
   // NOT: await logger.error(`Operation failed: ${error.message}`)
   ```

2. **Detailed server-side logging**
   ```typescript
   console.error('Detailed error for debugging:', error)
   // This appears in server logs, not user-facing logs
   ```

## Testing Changes

When making changes that involve logging:

1. **Search for dynamic values**
   ```bash
   # Check for logger statements with template literals
   grep -r "logger\.(info|error|success|command)\(\`.*\$\{" .
   
   # Check for console statements with template literals
   grep -r "console\.(log|error|warn|info)\(\`.*\$\{" .
   ```

2. **Verify no sensitive data exposure**
   - Test the feature in the UI
   - Check the logs displayed to users
   - Ensure no sensitive information is visible

## Configuration Security

### Environment Variables

Never expose these in logs or to the client:
- `SANDBOX_VERCEL_TOKEN` - Vercel API token
- `SANDBOX_VERCEL_TEAM_ID` - Vercel team identifier
- `SANDBOX_VERCEL_PROJECT_ID` - Vercel project identifier
- `ANTHROPIC_API_KEY` - Anthropic/Claude API key
- `OPENAI_API_KEY` - OpenAI API key
- `GEMINI_API_KEY` - Google Gemini API key
- `CURSOR_API_KEY` - Cursor API key
- `GH_TOKEN` / `GITHUB_TOKEN` - GitHub personal access token
- `JWE_SECRET` - Encryption secret
- `ENCRYPTION_KEY` - Encryption key
- Any user-provided API keys

### Client-Safe Variables

Only these variables should be exposed to the client (via `NEXT_PUBLIC_` prefix):
- `NEXT_PUBLIC_AUTH_PROVIDERS` - Available auth providers
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` - GitHub OAuth client ID (public)

## Architecture Guidelines

### Repository Page Structure

The repository page uses a nested routing structure with separate pages for each tab:

#### Route Structure
```
app/repos/[owner]/[repo]/
├── layout.tsx           # Shared layout with navigation tabs
├── page.tsx            # Redirects to /commits by default
├── commits/
│   └── page.tsx        # Commits page
├── issues/
│   └── page.tsx        # Issues page
└── pull-requests/
    └── page.tsx        # Pull Requests page
```

#### Components
- `components/repo-layout.tsx` - Shared layout component with tab navigation
- `components/repo-commits.tsx` - Commits list component
- `components/repo-issues.tsx` - Issues list component
- `components/repo-pull-requests.tsx` - Pull requests list component

#### API Routes
```
app/api/repos/[owner]/[repo]/
├── commits/route.ts         # GET - Fetch commits
├── issues/route.ts          # GET - Fetch issues
└── pull-requests/route.ts   # GET - Fetch pull requests
```

#### Key Features
1. **Tab Navigation**: Uses Next.js Link components for client-side navigation between tabs
2. **Separate Pages**: Each tab renders on its own route (commits, issues, pull-requests)
3. **Default Route**: Visiting `/repos/[owner]/[repo]` redirects to `/repos/[owner]/[repo]/commits`
4. **Active State**: The active tab is determined by matching the current pathname
5. **GitHub Integration**: All data is fetched from GitHub API using Octokit client

#### Adding New Tabs
To add a new tab to the repository page:

1. Create a new directory under `app/repos/[owner]/[repo]/[tab-name]/`
2. Add a `page.tsx` file that renders your component
3. Create the component in `components/repo-[tab-name].tsx`
4. Add an API route in `app/api/repos/[owner]/[repo]/[tab-name]/route.ts`
5. Update the `tabs` array in `components/repo-layout.tsx` to include the new tab
6. Follow the existing patterns for data fetching and error handling

## Compliance Checklist

Before submitting changes, verify:

- [ ] No template literals with `${}` in any log statements
- [ ] All logger calls use static strings
- [ ] All console calls use static strings (for user-facing logs)
- [ ] No sensitive data in error messages
- [ ] Tested in UI to confirm no data leakage
- [ ] Server-side debugging logs don't expose credentials
- [ ] Ran `pnpm format` and code is properly formatted
- [ ] Ran `pnpm format:check` to verify formatting
- [ ] Ran `pnpm type-check` and all type errors are fixed
- [ ] Ran `pnpm lint` and all linting errors are fixed
- [ ] Ran `pnpm build` to verify production build succeeds

## Questions?

If you need to log information for debugging purposes:
1. Use server-side console logs (not shown to users)
2. Still avoid logging sensitive credentials
3. Consider adding better error handling instead of logging details
4. Use generic user-facing messages

---

**Remember: When in doubt, use a static string. No exceptions.**

