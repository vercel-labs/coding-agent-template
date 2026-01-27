'use client'

import { useRef, useEffect } from 'react'

/**
 * Custom hook for storing the latest value in a ref without triggering effect re-runs.
 * Useful for callbacks that need to be stable for event listeners while always
 * executing the latest version of the function.
 *
 * @example
 * function Component({ callback }) {
 *   const callbackRef = useLatest(callback)
 *   useEffect(() => {
 *     element.addEventListener('click', (...args) => callbackRef.current(...args))
 *     return () => element.removeEventListener('click', handler)
 *   }, []) // Stable effect, never re-subscribes
 * }
 */
export function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}
