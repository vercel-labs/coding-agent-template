# Type Check & Fix

Comprehensively analyze and fix all TypeScript compatibility issues across the entire codebase.

## Usage
```
/type-check
```

## What it does
1. **Comprehensive Analysis**: Scan all TypeScript files for type errors and compatibility issues
2. **Component Interface Checking**: Verify React component prop types match usage patterns
3. **Library Compatibility**: Check for type mismatches with external libraries (ReactMarkdown, AI SDK, Next.js)
4. **Hook Dependencies**: Analyze React hooks for proper dependency arrays and type safety
5. **Import/Export Types**: Verify all type imports and exports are correct
6. **Auto-Fix Issues**: Automatically resolve common type compatibility problems
7. **Generate Report**: Provide detailed report of all fixes applied

## Common fixes applied
- **React Component Props**: Make optional props optional, add missing required props
- **ReactMarkdown Components**: Fix component type compatibility with markdown renderers  
- **AI SDK Types**: Update deprecated type patterns from v4 to v5
- **Next.js Link Types**: Ensure href props are properly typed
- **Hook Dependencies**: Add missing dependencies to useEffect, useMemo, useCallback
- **Generic Constraints**: Fix generic type constraints and extends clauses
- **Union Types**: Resolve union type compatibility issues
- **Interface Inheritance**: Fix interface extension and implementation issues

## Files analyzed
- `components/**/*.tsx` - All React components and UI elements
- `lib/**/*.ts` - Core library functions and utilities
- `app/**/*.tsx` - Next.js app router pages and layouts
- `hooks/**/*.ts` - Custom React hooks
- `types/**/*.ts` - Type definitions and interfaces

## Example output
```
✅ Fixed CodeBlock component props compatibility with ReactMarkdown
✅ Updated AI SDK types from v4 to v5 patterns
✅ Resolved 12 missing hook dependencies
✅ Fixed 5 Next.js Link href type issues
✅ All 47 TypeScript files now compile without errors
→ Ready for deployment
```
