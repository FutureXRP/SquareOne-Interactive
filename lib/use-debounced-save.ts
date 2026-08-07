'use client'
import { useCallback, useEffect, useRef } from 'react'

// Debounced writer for admin editors: local state updates instantly, the
// Supabase write fires after typing settles. flush() on unmount.
export function useDebouncedSave<T>(save: (v: T) => Promise<unknown>, delay = 700) {
  const timer = useRef<number | null>(null)
  const pending = useRef<T | null>(null)

  const schedule = useCallback((v: T) => {
    pending.current = v
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      const value = pending.current
      pending.current = null
      if (value !== null) save(value)
    }, delay)
  }, [save, delay])

  useEffect(() => () => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      if (pending.current !== null) save(pending.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return schedule
}
