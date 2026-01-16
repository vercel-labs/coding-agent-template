# Pre-Deploy Check

Comprehensive pre-deployment verification to prevent build failures.

## Usage
```
/pre-deploy
```

## What it does
1. **TypeScript Compilation**: Run `tsc --noEmit` to catch type errors
2. **Linting**: Execute ESLint and Biome with auto-fixes
3. **Build Simulation**: Test Next.js build process locally
4. **Hook Dependencies**: Check React hooks for missing dependencies
5. **Citation System**: Verify citation functionality works correctly

## Automated checks
- All TypeScript errors resolved
- No ESLint hook rule violations
- ReactMarkdown component compatibility
- AI SDK v5 compliance
- Citation context memory leaks
- Infinite render loop detection

## Pre-commit actions
- Stage all fixes automatically
- Create descriptive commit message
- Push to trigger Vercel deployment

## Example workflow
```
Running pre-deployment checks...
✓ TypeScript: No errors
✓ ESLint: All rules passing
✓ Build: Successful compilation
✓ Citations: No infinite loops
✓ Ready for deployment

Committing fixes and deploying...
→ Pushed to origin/main
```