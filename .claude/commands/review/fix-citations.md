# Fix Citations

Analyze and fix citation functionality issues including infinite loops and type safety.

## Usage
```
/fix-citations
```

## What it does
1. **RegisterCitations Analysis**: Check for infinite loop patterns in useEffect hooks
2. **Citation Context**: Verify proper memoization and context usage
3. **EnhancedLink Component**: Fix href type safety and prop spreading
4. **Hash-based Dependencies**: Implement efficient change detection
5. **Performance Optimization**: Remove redundant useMemo patterns

## Common issues fixed
- React Error #185: "Maximum update depth exceeded"
- Infinite re-renders in RegisterCitations component
- TypeScript errors in citation link components
- Missing dependency warnings in React hooks
- Circular dependencies in citation context

## Example fixes
- Convert results dependency to stable hash
- Fix EnhancedLink href prop type compatibility
- Optimize citation context value memoization
- Add proper ESLint suppressions with explanations

## Output
```
✓ No infinite loops detected
✓ Citation context properly memoized
✓ All citation components type-safe
✓ Performance optimized
```