# Hooks Module

## Domain Purpose
Client-side React hooks for data fetching, polling, and state management. Handle race conditions, retry logic, and polling intervals.

## Module Boundaries
- **Owns**: Hook logic, polling intervals, retry strategies, loading/error state
- **Delegates to**: Native `fetch()` for API calls, `useState`/`useEffect`/`useCallback` for state management

## Local Patterns
- **useTask Hook**: Fetch task by ID with intelligent retries
  - Initial fetch immediately
  - Retry every 2 seconds for up to 3 attempts (handles DB insert race condition)
  - Poll every 5 seconds after task is found
  - Only show "Task not found" after 3 failed attempts OR task was previously found then lost
- **Attempt Tracking**: Use `useRef` to track attempt count and successful first find
- **Loading State**: Show loading until task found OR attempt threshold exceeded
- **Poll Interval**: 5-second update frequency after initial discovery

## Integration Points
- `components/task-detail.tsx` - Display task data with live updates
- `app/tasks/[id]/page.tsx` - Task detail page loading and polling

## Key Files
- `use-task.ts` - Task fetching with retry logic and polling
