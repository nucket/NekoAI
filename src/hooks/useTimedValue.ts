import { useCallback, useEffect, useRef, useState } from 'react'

export interface TimedValue<T> {
  value: T | null
  /** Shows `value` for `ms`, then clears it and calls `onDone`. */
  show: (value: T, ms: number, onDone?: () => void) => void
  /** Sets (or clears, with null) the value with no timeout. */
  set: (value: T | null) => void
}

/** A value that clears itself after a delay; the timer is cancelled on unmount. */
export function useTimedValue<T>(): TimedValue<T> {
  const [value, setValue] = useState<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const show = useCallback((next: T, ms: number, onDone?: () => void) => {
    cancel()
    setValue(next)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setValue(null)
      onDone?.()
    }, ms)
  }, [])

  const set = useCallback((next: T | null) => {
    cancel()
    setValue(next)
  }, [])

  useEffect(() => cancel, [])

  return { value, show, set }
}
