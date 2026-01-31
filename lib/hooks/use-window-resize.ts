'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useLatest } from './use-latest'

/**
 * Custom hook for responsive window resize detection with debouncing.
 * Centralizes resize listener to prevent duplicate event handlers across components.
 * Provides breakpoint-based state to avoid multiple independent resize listeners.
 *
 * @param breakpoint - Pixel width threshold for desktop detection (default: 1024)
 * @param callback - Optional callback on resize
 * @returns Object with isDesktop state
 */
export function useWindowResize(breakpoint = 1024, callback?: () => void) {
  const timeoutRef = useRef<NodeJS.Timeout>(undefined)
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= breakpoint : true,
  )
  const callbackRef = useLatest(callback)

  const handleResize = useCallback(() => {
    const isNowDesktop = window.innerWidth >= breakpoint

    // Clear previous timeout to debounce rapid resizes
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Debounce by 100ms to batch multiple resize events
    timeoutRef.current = setTimeout(() => {
      // Update breakpoint state if changed
      setIsDesktop((prev) => (prev !== isNowDesktop ? isNowDesktop : prev))
      // Always fire callback on resize
      callbackRef.current?.()
    }, 100)
  }, [breakpoint, callbackRef])

  useEffect(() => {
    // Add listener
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      window.removeEventListener('resize', handleResize)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [breakpoint, handleResize])

  return { isDesktop }
}
