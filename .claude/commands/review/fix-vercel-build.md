# Fix Vercel Build

Debug and fix Vercel build failures with comprehensive analysis.

## Usage
```
/fix-vercel-build
```

## What it does
1. **Analyze Build Errors**: Parse Vercel build logs for specific error patterns
2. **TypeScript Compilation**: Run type checking and fix compilation errors
3. **React Component Issues**: Fix common React/Next.js component type mismatches
4. **Dependency Resolution**: Check for missing or incompatible dependencies
5. **Deploy Fixes**: Commit and push fixes to trigger new build

## Common fixes applied
- ReactMarkdown component type compatibility (CodeBlock, EnhancedLink)
- Next.js Link href type safety
- React hooks dependency arrays
- Missing prop types and interfaces
- AI SDK type mismatches

## Example output
```
✓ TypeScript compilation successful
✓ All components type-safe
✓ Build ready for deployment
→ Pushed fixes to trigger new build
```