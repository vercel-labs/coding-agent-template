# Fix React Hooks

Analyze and resolve React hooks issues including dependency arrays and infinite loops.

## Usage
```
/fix-react-hooks
```

## What it does
1. **Dependency Analysis**: Scan all useEffect and useMemo hooks for missing dependencies
2. **Infinite Loop Detection**: Identify circular dependencies and over-rendering
3. **Optimization Patterns**: Implement efficient memoization strategies
4. **ESLint Compliance**: Fix react-hooks/exhaustive-deps warnings
5. **Performance Tuning**: Remove unnecessary re-renders

## Specific patterns addressed
- RegisterCitations infinite loop (hash-based dependencies)
- Citation context memoization optimization
- useEffect dependency array optimization
- useMemo redundant pattern removal
- React Hook Rule violations

## Smart fixes applied
- Replace object dependencies with stable hashes
- Add proper ESLint suppressions with explanations
- Implement comprehensive change detection
- Optimize context value calculations
- Fix component prop spreading in hooks

## Example fixes
```javascript
// Before: Causes infinite loops
useEffect(() => {
  addCitations(results);
}, [addCitations, results]);

// After: Stable dependencies
useEffect(() => {
  addCitations(results);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [addCitations, resultsHash]);
```